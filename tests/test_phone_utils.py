import unittest

from core.phone_utils import extract_phones, normalize_phone


class VietnamPhoneUtilsTests(unittest.TestCase):
    def test_supported_mobile_formats(self):
        cases = {
            '0912345678': '0912345678',
            '0912 345 678': '0912345678',
            '0912.345.678': '0912345678',
            '0912-345-678': '0912345678',
            '+84 912 345 678': '0912345678',
            '0084 912 345 678': '0912345678',
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                self.assertEqual(normalize_phone(raw), expected)

    def test_extracts_unique_numbers(self):
        self.assertEqual(
            extract_phones('Gọi 0912 345 678 hoặc +84 987-654-321; nhắc lại 0912345678'),
            ['0912345678', '0987654321'],
        )

    def test_rejects_clear_non_phone_numbers(self):
        for value in ('1234567890', '0123456789', '202608201234', '111-222-3333'):
            with self.subTest(value=value):
                self.assertEqual(normalize_phone(value), '')
        self.assertEqual(extract_phones('Mã đơn 1234567890, giá 12.345.678 đồng'), [])


if __name__ == '__main__':
    unittest.main()
