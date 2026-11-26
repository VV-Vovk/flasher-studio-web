"""Stage only the reviewed first-party public STM32 package; fail closed on changed bytes."""
import hashlib, io, json, pathlib, urllib.request, zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
BASE='https://github.com/VV-Vovk/flasher-studio-bootloaders-public/releases/download/v0.2.2/'
NAME='stm32f103c8-uart-recovery-0.2.2.zip'
ZIP_SHA='a2c5a1e5b147fdad3a820e921ab071c52f86c15fc7196e8c37f2cd5b9acb1b33'
CAT_SHA='981d11279bb6ebc93f62020f8e5dd8ac6255928d2bbe19f99f9ffa01c95e080b'
def checked_download(name, size, digest):
    req=urllib.request.Request(BASE+name,headers={'User-Agent':'Flasher-Studio-public-package-build'})
    with urllib.request.urlopen(req,timeout=60) as r:
        data=r.read(size+1)
    if len(data)!=size or hashlib.sha256(data).hexdigest()!=digest:
        raise ValueError('Pinned public release changed: '+name)
    return data
def validate(catalog,archive):
    c=json.loads(catalog)
    if c['version']!='0.2.2' or len(c['packages'])!=1: raise ValueError('public catalog')
    e=c['packages'][0];m=e['manifest'];p=e['package']
    if p!={'file':NAME,'size':7862,'sha256':ZIP_SHA}: raise ValueError('package metadata')
    if m['id']!='stm32f103c8-uart-recovery' or m['version']!='0.2.2' or m['kind']!='stm32-uart-recovery' or m['autoInstall'] is not False or m['validation']!='ci-generated-not-hardware-tested': raise ValueError('candidate identity')
    if m['source']['license']!='Apache-2.0' or m['source']['repo']!='https://github.com/VV-Vovk/flasher-studio-bootloaders-public' or m['source']['ref']!='b33065275b86c3b4297c8890bb336bcc4fd72724': raise ValueError('source and license')
    t=m['target'];u=m['update']
    if t['mcu']!='STM32F103C8T6' or t['flashBytes']!=65536 or t['ramBytes']!=20480 or u['applicationOffset']!=0x08004000 or u['maxAppBytes']!=0xbc00 or u['metadataOffset']!=0x0800fc00: raise ValueError('target layout')
    with zipfile.ZipFile(io.BytesIO(archive)) as z:
        if sorted(z.namelist())!=sorted(['bootloader.bin','application.ld','LICENSE','STM32-README.md','manifest.json']): raise ValueError('unexpected ZIP content')
        if json.loads(z.read('manifest.json'))!=m or b'Apache License' not in z.read('LICENSE') or b'Version 2.0' not in z.read('LICENSE'): raise ValueError('manifest or license')
        for f in [*m['files'],m['applicationLinker']]:
            b=z.read(f['file'])
            if len(b)!=f['size'] or hashlib.sha256(b).hexdigest()!=f['sha256']: raise ValueError('component checksum')
    return e
def main():
    c=checked_download('catalog.json',2163,CAT_SHA)
    b=checked_download(NAME,7862,ZIP_SHA)
    e=validate(c,b)
    public=ROOT/'public';path=public/'boot-catalog.json';local=json.loads(path.read_text())
    local['packages']=[e]+[x for x in local['packages'] if (x['manifest']['id'],x['manifest']['version'])!=(e['manifest']['id'],e['manifest']['version'])]
    out=public/'boot-packages';out.mkdir(exist_ok=True)
    (out/NAME).write_bytes(b)
    path.write_text(json.dumps(local,indent=2,ensure_ascii=False)+'\n')
    print('Verified and staged public STM32 FS10 v0.2.2 (Apache-2.0).')
if __name__=='__main__':main()
