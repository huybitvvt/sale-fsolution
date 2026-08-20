import unittest
from unittest.mock import patch

import app as backend


class FacebookPostHistoryTests(unittest.TestCase):
    def test_extracts_post_id_only_from_facebook_permalink(self):
        self.assertEqual(
            backend._facebook_post_id_from_url('https://www.facebook.com/groups/280811807457314/posts/123456789012345/'),
            '123456789012345',
        )
        self.assertEqual(
            backend._facebook_post_id_from_url('https://m.facebook.com/permalink.php?story_fbid=987654321&id=123'),
            '987654321',
        )
        self.assertEqual(
            backend._facebook_post_id_from_url('https://www.facebook.com/photo/?fbid=456789123'),
            '456789123',
        )
        self.assertEqual(backend._facebook_post_id_from_url('https://www.facebook.com/share/p/opaque-code/'), '')
        self.assertEqual(backend._facebook_post_id_from_url('https://example.com/posts/123456789'), '')

    def test_success_requires_post_id_or_confirmed_published_outcome(self):
        saved = []

        def capture(row):
            saved.append(row)
            return row, ''

        with backend.app.test_request_context('/'):
            with (
                patch.object(backend, '_current_staff', return_value={'id': 'sale-1', 'name': 'Sale A'}),
                patch.object(backend, '_save_facebook_post', side_effect=capture),
            ):
                backend._record_publish_results(
                    {'content': 'Camera AI'},
                    [{'type': 'page', 'id': 'page-1', 'name': 'Trang A'}],
                    {'ok': True, 'results': [{'ok': True, 'type': 'page', 'id': 'page-1', 'delivery': 'submitted'}]},
                    source='chrome_extension', request_id='req-1',
                )
                self.assertEqual(saved[-1]['status'], 'pending')
                self.assertIsNone(saved[-1]['published_at'])

                backend._record_publish_results(
                    {'content': 'Camera AI'},
                    [{'type': 'page', 'id': 'page-1', 'name': 'Trang A'}],
                    {'ok': True, 'results': [{'ok': True, 'type': 'page', 'id': 'page-1', 'delivery': 'published'}]},
                    source='chrome_extension', request_id='req-published',
                )
                self.assertEqual(saved[-1]['status'], 'success')

                backend._record_publish_results(
                    {'content': 'Camera AI'},
                    [{'type': 'page', 'id': 'page-1', 'name': 'Trang A'}],
                    {'ok': True, 'results': [{'ok': True, 'type': 'page', 'id': 'page-1', 'post_id': 'page-1_post-1'}]},
                    source='api_publish', request_id='req-2',
                )
                self.assertEqual(saved[-1]['status'], 'success')
                self.assertEqual(saved[-1]['facebook_post_id'], 'page-1_post-1')
                self.assertTrue(saved[-1]['post_url'].endswith('page-1_post-1'))

    def test_failed_target_keeps_error(self):
        with backend.app.test_request_context('/'):
            with (
                patch.object(backend, '_current_staff', return_value={'id': 'sale-1'}),
                patch.object(backend, '_save_facebook_post', side_effect=lambda row: (row, '')),
            ):
                rows = backend._record_publish_results(
                    {'content': 'Bài lỗi'},
                    [{'type': 'group', 'id': 'group-1'}],
                    {'ok': False, 'results': [{'ok': False, 'type': 'group', 'id': 'group-1', 'error': 'Facebook từ chối'}]},
                    source='api_publish', request_id='req-failed',
                )
        self.assertEqual(rows[0]['status'], 'failed')
        self.assertEqual(rows[0]['error_message'], 'Facebook từ chối')

    def test_comment_without_phone_can_become_stable_lead(self):
        comment = {
            'source': 'facebook_page',
            'post_id': 'page-1_post-1',
            'group_id': 'page-1',
            'post_url': 'https://www.facebook.com/page-1_post-1',
            'comment_id': 'comment-1',
            'author_id': 'user-1',
            'author_name': 'Nguyễn A',
            'message': 'Cho mình xin demo',
        }
        leads = backend._comment_rows_to_phone_leads([comment], include_without_phone=True)
        self.assertEqual(len(leads), 1)
        self.assertEqual(leads[0]['phone'], '')
        self.assertEqual(leads[0]['contact_status'], 'no_phone')
        self.assertEqual(leads[0]['facebook_uid'], 'user-1')
        self.assertEqual(leads[0]['lead_key'], backend._comment_rows_to_phone_leads([comment], include_without_phone=True)[0]['lead_key'])


if __name__ == '__main__':
    unittest.main()
