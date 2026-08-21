import unittest
from unittest.mock import Mock, patch

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

    def test_builds_canonical_graph_post_id_candidates(self):
        self.assertEqual(
            backend._facebook_post_id_candidates({
                'post_url': 'https://www.facebook.com/permalink.php?story_fbid=456&id=123',
            }),
            ['123_456', '456'],
        )
        self.assertEqual(
            backend._facebook_post_id_candidates({
                'post_url': 'https://www.facebook.com/groups/789/posts/456/',
            }),
            ['789_456', '456'],
        )

    def test_accepts_numeric_and_opaque_facebook_post_links_only(self):
        self.assertTrue(backend._is_facebook_post_url('https://www.facebook.com/groups/789/posts/456/'))
        self.assertTrue(backend._is_facebook_post_url('https://www.facebook.com/share/p/opaque-code/'))
        self.assertTrue(backend._is_facebook_post_url('https://m.facebook.com/reel/123456/'))
        self.assertFalse(backend._is_facebook_post_url('http://www.facebook.com/share/p/opaque-code/'))
        self.assertFalse(backend._is_facebook_post_url('https://example.com/share/p/opaque-code/'))

    def test_failed_metrics_refresh_does_not_write_a_fake_timestamp(self):
        row = {
            'id': 'history-1',
            'facebook_post_id': '123_456',
            'target_id': '123',
            'metrics_updated_at': '',
        }
        client = Mock(last_graph_error='Unsupported get request')
        client.get_post_engagement.return_value = None
        with (
            patch.object(backend, 'get_api', return_value=client),
            patch.object(backend, '_save_facebook_post') as save_mock,
        ):
            updated, warning = backend._refresh_single_post_metrics(row)

        self.assertIs(updated, row)
        self.assertIn('Unsupported get request', warning)
        save_mock.assert_not_called()

    def test_metrics_refresh_persists_real_zero_counts(self):
        row = {
            'id': 'history-1',
            'facebook_post_id': '456',
            'target_id': '123',
            'post_url': '',
        }
        client = Mock(last_graph_error='')
        client.get_post_engagement.return_value = {
            'facebook_post_id': '123_456',
            'post_url': 'https://www.facebook.com/groups/123/posts/456/',
            'reaction_count': 0,
            'comment_count': 0,
            'share_count': 0,
        }
        with (
            patch.object(backend, 'get_api', return_value=client),
            patch.object(backend, '_save_facebook_post', side_effect=lambda value: (value, '')) as save_mock,
        ):
            updated, warning = backend._refresh_single_post_metrics(row)

        self.assertEqual(warning, '')
        self.assertEqual(updated['facebook_post_id'], '123_456')
        self.assertEqual(updated['total_interactions'], 0)
        self.assertTrue(updated['metrics_updated_at'])
        save_mock.assert_called_once()

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
