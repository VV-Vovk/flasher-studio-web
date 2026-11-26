#!/usr/bin/env python3
"""Flasher Studio: local clients, no server, no cloud upload. Python 3.9+.
Experimental: physical hardware tests pending. Use only test boards.
"""
import argparse, getpass, hashlib, ipaddress, json, pathlib, re, shutil, struct, subprocess, tempfile, urllib.request
CHIPS={'esp32':0,'esp32s2':2,'esp32c3':5,'esp32s3':9,'esp32c6':13,'esp32h2':16}
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kw): return None

def request(ip,path,body=None,headers=None):
    addr=ipaddress.IPv4Address(ip)
    if addr not in ipaddress.IPv4Network('192.168.0.0/16'):raise ValueError('Only local 192.168/16 addresses permitted')
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
    r=urllib.request.Request(f'http://{addr}/v1/{path}',data=body,headers=headers or {})
    with opener.open(r,timeout=120) as f:return f.read(65536).decode()

def app_check(data,target,limit):
    if not 36<=len(data)<=limit or data[0]!=0xe9 or struct.unpack_from('<H',data,12)[0]!=CHIPS[target] or struct.unpack_from('<I',data,32)[0]!=0xabcd5432:raise ValueError('Not an app-only ESP image for target')
    count=data[1];pos=24
    if not 1<=count<=16:raise ValueError('Segment count')
    for _ in range(count):
        if pos+8>len(data):raise ValueError('Segment header')
        pos+=8+struct.unpack_from('<I',data,pos+4)[0]
        if pos>len(data):raise ValueError('Segment bounds')
    if ((pos+1+15)//16)*16+(32 if data[23]==1 else 0)!=len(data):raise ValueError('Merged or unsupported image')

def wifi(a):
    info=json.loads(request(a.ip,'info'));print(info)
    if info.get('protocol')!=1 or info.get('target')!=a.target or info.get('busy') or not isinstance(info.get('maxBytes'),int) or not 65536<=info['maxBytes']<=16*1024*1024:raise ValueError('Wrong or busy Recovery')
    data=pathlib.Path(a.image).read_bytes();app_check(data,a.target,info['maxBytes'])
    token=getpass.getpass('Saved per-device Recovery token: ').strip()
    if not re.fullmatch('[0-9a-fA-F]{32}',token):raise ValueError('Token: 32 hex characters')
    print('SHA-256:',hashlib.sha256(data).hexdigest())
    if input('Confirm matching Recovery layout and exact test board. Type WRITE: ')!='WRITE':return
    result=request(a.ip,'update',data,{'X-FS-Token':token,'X-FS-SHA256':hashlib.sha256(data).hexdigest(),'Content-Type':'application/octet-stream'})
    if result.strip()!='OK; restarting':raise RuntimeError('Unexpected Recovery response: '+result)
    print('Recovery accepted the SHA-256 and image; application execution not verified.')

def ihex_ranges(path,limit,start=0):
    base=0;seen={};eof=False
    for line in path.read_text().splitlines():
        if not line:continue
        if eof or not line.startswith(':'):raise ValueError('HEX structure')
        b=bytes.fromhex(line[1:]);n=b[0];off=int.from_bytes(b[1:3],'big');t=b[3]
        if len(b)!=n+5 or sum(b)%256:raise ValueError('HEX checksum')
        if t==0:
            for i,addr in enumerate(range(base+off,base+off+n)):
                if not start<=addr<limit or addr in seen:raise ValueError('HEX outside application or overlapping')
                seen[addr]=b[4+i]
        elif t==1 and n==0 and off==0:eof=True
        elif t in (2,4) and n==2 and off==0:base=int.from_bytes(b[4:6],'big')<<(4 if t==2 else 16)
        elif t in (3,5) and n==4 and off==0:pass
        else:raise ValueError('Unsupported HEX record')
    if not eof or not seen or start not in seen:raise ValueError('Missing EOF or reset vector')
    return seen

def avr(a):
    tool=shutil.which('avrdude')
    if not tool:raise RuntimeError('Install AVRDUDE 7.2+ and correct programmer drivers first')
    part=a.part;limit={'m328':32384,'m328p':32384,'m4809':49152,'t1616':16384,'t3216':32768,'t817':8192}[part]
    if a.protocol=='urclock' and part not in ('m328','m328p'):raise ValueError('Urboot profile not supported')
    if a.protocol=='serialupdi' and part in ('m328','m328p'):raise ValueError('ATmega328 does not have UPDI')
    path=pathlib.Path(a.image).resolve();ihex_ranges(path,limit)
    if ':' in path.name:raise ValueError('Unsupported filename')
    # Do not accept arbitrary executable/AVRDUDE flags from a project. No force/no verify disable.
    if not re.fullmatch(r'(?:/dev/[A-Za-z0-9_./-]+|COM[0-9]+)',a.port,re.I):raise ValueError('Serial port path')
    args=[tool,'-p',part,'-c',a.protocol,'-P',a.port,'-b',str(a.baud)]
    subprocess.run(args+['-n'],check=True)
    if input('Exact test board and clock confirmed. Flash may erase current application. Type WRITE: ')!='WRITE':return
    # Pass a basename from its parent directory for Windows drive-letter paths.
    subprocess.run(args+['-U','flash:w:'+path.name+':i'],cwd=path.parent,check=True)
    subprocess.run(args+['-U','flash:v:'+path.name+':i'],cwd=path.parent,check=True)
    print('AVRDUDE write and verify succeeded. Application execution not tested.')

def swd(a):
    tool=shutil.which('openocd')
    if not tool:raise RuntimeError('Install OpenOCD with the adapter drivers and config files')
    limit={'STM32F103C8T6':65536,'STM32F103CBT6':131072}[a.target]
    data=pathlib.Path(a.image).read_bytes()
    if not 8<=len(data)<=limit:raise ValueError('BIN size')
    sp,pc=struct.unpack_from('<II',data)
    if not 0x20000000<sp<=0x20005000 or sp%8 or not pc&1 or not 0x08000000<=pc-1<0x08000000+len(data):raise ValueError('Invalid app vector at 0x08000000')
    interface={'stlink':'interface/stlink.cfg','cmsis-dap':'interface/cmsis-dap.cfg','jlink':'interface/jlink.cfg'}[a.adapter]
    transport='dapdirect_swd' if a.adapter=='stlink' else 'swd'
    args=[tool,'-f',interface,'-c','transport select '+transport,'-f','target/stm32f1x.cfg','-c','adapter speed 500','-c','gdb_port disabled; tcl_port disabled; telnet_port disabled']
    check=('init; reset halt; set chip [mrw 0xe0042000]; '
           'if {($chip & 0xfff) != 0x410} {error "Wrong chip ID"}; '
           'set fsize [mrh 0x1ffff7e0]; if {$fsize != '+str(limit//1024)+'} {error "Wrong Flash size"}; ')
    print('SHA-256:',hashlib.sha256(data).hexdigest())
    if input('Confirm one connected, exact test board; sectors will be erased. Type WRITE: ')!='WRITE':return
    with tempfile.TemporaryDirectory(prefix='fs-swd-') as d:
        pathlib.Path(d,'image.bin').write_bytes(data)
        # Same session validates target, writes and verifies; no option byte commands.
        script=check+'flash write_image erase image.bin 0x08000000 bin; verify_image image.bin 0x08000000 bin; shutdown'
        subprocess.run(args+['-c',script],cwd=d,check=True)
    print('OpenOCD write and verify returned success. Reset board manually; execution not tested.')

def nordic(a):
    tool=shutil.which('adafruit-nrfutil')
    if not tool:raise RuntimeError('Install adafruit-nrfutil first')
    path=pathlib.Path(a.image).resolve()
    # Conservative S140 application window for Feather nRF52840. Never update SoftDevice or bootloader.
    start,limit=0x26000,0xf4000;data=ihex_ranges(path,limit,start)
    try:sp,pc=struct.unpack('<II',bytes(data[start+i] for i in range(8)))
    except KeyError as exc:raise ValueError('Missing reset vector') from exc
    if not 0x20000000<sp<=0x20040000 or sp%8 or not pc&1 or pc-1 not in data:raise ValueError('Invalid application vectors')
    if not re.fullmatch(r'(?:/dev/[A-Za-z0-9_./-]+|COM[0-9]+)',a.port,re.I):raise ValueError('Serial port path')
    if not re.fullmatch(r'0x[0-9a-fA-F]{4}',a.sd_req):raise ValueError('Exact installed SoftDevice FWID required (0xNNNN)')
    print('SHA-256 HEX:',hashlib.sha256(path.read_bytes()).hexdigest())
    if input('Confirm Feather nRF52840 Express, matching S140 FWID and serial DFU boot mode. Type WRITE: ')!='WRITE':return
    with tempfile.TemporaryDirectory(prefix='fs-nrf-') as d:
        pathlib.Path(d,'app.hex').write_bytes(path.read_bytes())
        subprocess.run([tool,'dfu','genpkg','--dev-type','0x0052','--sd-req',a.sd_req,'--application','app.hex','app.zip'],cwd=d,check=True)
        subprocess.run([tool,'dfu','serial','--package','app.zip','-p',a.port,'-b','115200','--singlebank'],cwd=d,check=True)
    print('DFU tool returned success; independent readback and execution not verified.')

def main():
    p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest='mode',required=True)
    w=sub.add_parser('wifi');w.add_argument('image');w.add_argument('--target',choices=CHIPS,required=True);w.add_argument('--ip',default='192.168.4.1');w.set_defaults(run=wifi)
    a=sub.add_parser('avr');a.add_argument('image');a.add_argument('--part',choices=['m328','m328p','m4809','t1616','t3216','t817'],required=True);a.add_argument('--protocol',choices=['urclock','serialupdi'],required=True);a.add_argument('--port',required=True);a.add_argument('--baud',type=int,choices=[38400,57600,115200,230400],required=True);a.set_defaults(run=avr)
    d=sub.add_parser('swd');d.add_argument('image');d.add_argument('--target',choices=['STM32F103C8T6','STM32F103CBT6'],required=True);d.add_argument('--adapter',choices=['stlink','cmsis-dap','jlink'],required=True);d.set_defaults(run=swd)
    n=sub.add_parser('nordic');n.add_argument('image');n.add_argument('--port',required=True);n.add_argument('--sd-req',required=True,help='exact installed S140 firmware ID');n.set_defaults(run=nordic)
    args=p.parse_args();args.run(args)
if __name__=='__main__':main()
