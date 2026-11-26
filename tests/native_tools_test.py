import importlib.util, pathlib, struct, tempfile, unittest
from unittest.mock import patch
from types import SimpleNamespace
spec=importlib.util.spec_from_file_location('native_tools',pathlib.Path(__file__).resolve().parents[1]/'public/native-tools.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def record(t,off,data):
    b=bytes([len(data),off>>8,off&255,t])+data;return ':'+(b+bytes([-sum(b)&255])).hex()+'\n'
class NativeTests(unittest.TestCase):
    def test_wifi_header(self):
        b=bytearray(48);b[0]=0xe9;b[1]=1;b[12]=5;struct.pack_into('<II',b,28,4,0xabcd5432);m.app_check(b,'esp32c3',65536)
        with self.assertRaises(ValueError):m.app_check(b,'esp32s3',65536)
        with self.assertRaises(ValueError):m.app_check(b+bytes(10),'esp32c3',65536)
    def test_hex_ranges(self):
        with tempfile.TemporaryDirectory() as d:
            f=pathlib.Path(d,'app.hex');f.write_text(record(0,0,b'\x01\x02')+record(1,0,b''));self.assertEqual(m.ihex_ranges(f,32384),{0:1,1:2})
            f.write_text(record(0,32383,b'\x01\x02')+record(1,0,b''));self.assertRaises(ValueError,m.ihex_ranges,f,32384)
    def test_local_network_only(self):
        with self.assertRaises(ValueError):m.request('8.8.8.8','info')
    def test_openocd_rejects_bad_vector_before_running(self):
        with tempfile.TemporaryDirectory() as d,patch.object(m.shutil,'which',return_value='openocd'),patch.object(m.subprocess,'run') as run:
            f=pathlib.Path(d,'app.bin');f.write_bytes(b'\xff'*16)
            self.assertRaises(ValueError,m.swd,SimpleNamespace(image=str(f),target='STM32F103C8T6',adapter='stlink'));run.assert_not_called()
    def test_avr_wrong_protocol_before_running(self):
        with patch.object(m.shutil,'which',return_value='avrdude'),patch.object(m.subprocess,'run') as run:
            self.assertRaises(ValueError,m.avr,SimpleNamespace(part='m328p',protocol='serialupdi'));run.assert_not_called()
if __name__=='__main__':unittest.main()
