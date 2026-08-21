import unittest
from unittest.mock import Mock, patch

import app as backend


class FacebookPostHistoryTests(unittest.TestCase):
    def test_load_merges_legacy_kv_history_with_partial_remote_table(self):
        legacy_rows = [
            {
                'id': 'legacy-only',
                'external_key': 'chrome:old:group:1',
                'content': 'Bài cũ từ app_kv',
                'created_at': '2026-08-20T10:00:00Z',
            },
            {
                'id': 'shared-old-id',
                'external_key': 'chrome:shared:group:2',
                'status': 'failed',
                'created_at': '2026-08-20T11:00:00Z',
            },
        ]
        remote_rows = [
            {
                'id': 'shared-new-id',
                'external_key': 'chrome:shared:group:2',
                'status': 'success',
                'post_url': 'https://www.facebook.com/groups/2/posts/3/',
                'created_at': '2026-08-20T11:00:00Z',
            },
            {
                'id': 'remote-only',
                'external_key': 'chrome:new:group:3',
                'content': 'Bài mới trong bảng',
                'created_at': '2026-08-21T10:00:00Z',
            },
        ]
        response = Mock(status_code=200)
        response.json.return_value = remote_rows

        with (
            patch.object(backend, '_facebook_posts', legacy_rows.copy()),
            patch.object(backend, 'USE_SUPABASE', True),
            patch.object(backend, 'SUPABASE_URL', 'https://example.supabase.co'),
            patch.object(backend, 'SUPABASE_KEY', 'test-key'),
            patch.object(backend._req, 'get', return_value=response),
        ):
            rows, warning = backend._load_facebook_posts()

        self.assertEqual(warning, '')
        self.assertEqual(len(rows), 3)
        self.assertEqual({row['external_key'] for row in rows}, {
            'chrome:old:group:1',
            'chrome:shared:group:2',
            'chrome:new:group:3',
        })
        shared = next(row for row in rows if row['external_key'] == 'chrome:shared:group:2')
        self.assertEqual(shared['id'], 'shared-new-id')
        self.assertEqual(shared['status'], 'success')
        self.assertTrue(shared['post_url'])

    def test_keeps_synthetic_legacy_rows_and_marks_them_unverified(self):
        row = {
            'source': 'chrome_extension',
            'status': 'failed',
            'delivery': '',
            'error_message': 'Facebook không trả Post ID',
            'facebook_post_id': None,
            'post_url': '',
        }

        self.assertTrue(backend._is_synthetic_untrackable_facebook_post(row))
        with patch.object(backend, '_is_admin', return_value=True):
            self.assertEqual(backend._visible_facebook_post_rows([row]), [row])
        self.assertTrue(backend._facebook_post_history_row(row)['legacy_unverified'])

    def test_does_not_mark_a_real_publish_failure_as_legacy_unverified(self):
        row = {
            'source': 'chrome_extension',
            'status': 'failed',
            'delivery': 'confirmation_timeout',
            'error_message': 'Không xác nhận được caption trong hộp soạn bài Facebook.',
            'facebook_post_id': None,
            'post_url': '',
        }

        self.assertNotIn('legacy_unverified', backend._facebook_post_history_row(row))

    def test_history_includes_recreated_staff_with_same_username(self):
        rows = [
            {'id': 'old', 'created_by_staff_id': 'old-id', 'created_by_staff_username': 'khach-test'},
            {'id': 'other', 'created_by_staff_id': 'other-id', 'created_by_staff_username': 'other'},
        ]
        current = {'id': 'new-id', 'username': 'Khach-Test', 'role': 'staff'}
        with (
            patch.object(backend, '_current_staff', return_value=current),
            patch.object(backend, '_staff_accounts', return_value=[current]),
        ):
            visible = backend._visible_facebook_post_rows(rows)

        self.assertEqual([row['id'] for row in visible], ['old'])

    def test_history_includes_staff_sharing_the_same_facebook_account(self):
        current = {
            'id': 'current-id',
            'username': 'current',
            'role': 'staff',
            'facebook_user_id': '123456',
        }
        same_facebook = {
            'id': 'old-machine-id',
            'username': 'old-machine',
            'role': 'staff',
            'facebook_cookies': [{'id': 'fb-1', 'cookie': 'c_user=123456; xs=abc'}],
        }
        different_facebook = {
            'id': 'other-id',
            'username': 'other',
            'role': 'staff',
            'facebook_user_id': '999999',
        }
        rows = [
            {'id': 'shared', 'created_by_staff_id': 'old-machine-id', 'created_by_staff_username': 'old-machine'},
            {'id': 'private', 'created_by_staff_id': 'other-id', 'created_by_staff_username': 'other'},
        ]
        with (
            patch.object(backend, '_current_staff', return_value=current),
            patch.object(backend, '_staff_accounts', return_value=[current, same_facebook, different_facebook]),
        ):
            visible = backend._visible_facebook_post_rows(rows)

        self.assertEqual([row['id'] for row in visible], ['shared'])

    def test_keeps_real_publish_failures_for_diagnostics(self):
        row = {
            'source': 'chrome_extension',
            'status': 'failed',
            'delivery': 'confirmation_timeout',
            'error_message': 'Không xác nhận được caption trong hộp soạn bài Facebook.',
            'facebook_post_id': None,
            'post_url': '',
        }

        self.assertFalse(backend._is_synthetic_untrackable_facebook_post(row))
        with patch.object(backend, '_is_admin', return_value=True):
            self.assertEqual(backend._visible_facebook_post_rows([row]), [row])

    def test_keeps_failed_rows_that_have_a_reference(self):
        row = {
            'source': 'chrome_extension',
            'status': 'failed',
            'error_message': 'Facebook không trả Post ID',
            'facebook_post_id': 'group-1_post-1',
            'post_url': 'https://www.facebook.com/groups/group-1/posts/post-1/',
        }

        self.assertFalse(backend._is_synthetic_untrackable_facebook_post(row))

    def test_extension_result_skips_cancelled_targets_but_keeps_real_results(self):
        body = {
            'request_id': 'queue-1',
            'content': 'Bài đăng thử nghiệm',
            'targets': [
                {'type': 'group', 'id': 'group-1', 'name': 'Nhóm 1'},
                {'type': 'group', 'id': 'group-2', 'name': 'Nhóm 2'},
            ],
            'results': [
                {'ok': True, 'type': 'group', 'id': 'group-1', 'delivery': 'published'},
                {'ok': False, 'type': 'group', 'id': 'group-2', 'delivery': 'cancelled'},
            ],
        }
        with backend.app.test_request_context('/api/facebook-posts/extension-result', method='POST', json=body):
            with patch.object(backend, '_record_publish_results', return_value=[]) as record_mock:
                response = backend.facebook_posts_extension_result()

        self.assertTrue(response.get_json()['ok'])
        saved_targets = record_mock.call_args.args[1]
        saved_results = record_mock.call_args.args[2]['results']
        self.assertEqual([item['id'] for item in saved_targets], ['group-1'])
        self.assertEqual([item['id'] for item in saved_results], ['group-1'])

    def test_extracts_post_id_only_from_facebook_permalink(self):
        self.assertEqual(
            backend._facebook_post_id_from_url('https://www.facebook.com/groups/280811807457314/posts/123456789012345/'),
            '123456789012345',
        )
        self.assertEqual(
            backend._facebook_post_id_from_url('https://www.facebook.com/phan.hieu/posts/pfbid02AbCdEf123/'),
            'pfbid02AbCdEf123',
        )
        self.assertEqual(
            backend._facebook_post_id_from_url('https://m.facebook.com/permalink.php?story_fbid=987654321&id=123'),
            '987654321',
        )
        self.assertEqual(
            backend._facebook_post_id_from_url('https://www.facebook.com/photo/?fbid=456789123'),
            '456789123',
        )
        self.assertEqual(backend._facebook_post_id_from_url('https://www.facebook.com/share/p/opaque-code/'), 'opaque-code')
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

    def test_group_resolve_requires_extension_without_calling_graph(self):
        row = {'id': 'history-1', 'target_type': 'group', 'target_id': '123', 'facebook_post_id': None}
        with backend.app.test_request_context('/api/facebook-posts/history-1/resolve', method='POST', json={}):
            with (
                patch.object(backend, '_facebook_post_by_id', return_value=row),
                patch.object(backend, 'get_api') as get_api_mock,
            ):
                response, status = backend.facebook_post_reference_resolve('history-1')

        self.assertEqual(status, 409)
        self.assertTrue(response.get_json()['extension_required'])
        get_api_mock.assert_not_called()

    def test_group_metrics_and_comments_require_extension_without_graph(self):
        row = {
            'id': 'history-1',
            'target_type': 'group',
            'target_id': '123',
            'facebook_post_id': '123_456',
        }
        with patch.object(backend, '_facebook_post_by_id', return_value=row):
            with backend.app.test_request_context('/api/facebook-posts/history-1/refresh', method='POST'):
                refresh_response, refresh_status = backend.facebook_post_refresh('history-1')
            with backend.app.test_request_context('/api/facebook-posts/history-1/comments', method='POST'):
                comments_response, comments_status = backend.facebook_post_comments_collect('history-1')

        self.assertEqual(refresh_status, 409)
        self.assertTrue(refresh_response.get_json()['extension_required'])
        self.assertEqual(comments_status, 409)
        self.assertTrue(comments_response.get_json()['extension_required'])

    def test_background_metrics_helper_skips_groups_without_graph(self):
        row = {'id': 'history-1', 'target_type': 'group', 'facebook_post_id': '123_456'}
        with patch.object(backend, 'get_api') as get_api_mock:
            updated, warning = backend._refresh_single_post_metrics(row)

        self.assertIs(updated, row)
        self.assertIn('Chrome Extension', warning)
        get_api_mock.assert_not_called()

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

    def test_extracts_group_id_to_reject_a_permalink_from_another_group(self):
        self.assertEqual(
            backend._facebook_group_id_from_url('https://www.facebook.com/groups/123456/posts/987654/'),
            '123456',
        )
        self.assertEqual(backend._facebook_group_id_from_url('https://www.facebook.com/people/name/posts/987654/'), '')

    def test_finds_unique_post_by_content_and_publish_time(self):
        row = {
            'content': 'Bài tuyển dụng cần tìm nhân sự kinh doanh tại Hà Nội.\n\n#tuyendung',
            'created_at': '2026-08-21T09:00:00Z',
        }
        matched, error = backend._find_facebook_post_candidate(row, [
            {
                'id': 'group_old',
                'message': row['content'],
                'created_time': '2026-08-18T09:00:00Z',
            },
            {
                'id': 'group_new',
                'message': row['content'],
                'created_time': '2026-08-21T09:00:20Z',
            },
        ])
        self.assertEqual(error, '')
        self.assertEqual(matched['id'], 'group_new')

    def test_refuses_ambiguous_duplicate_posts(self):
        row = {'content': 'Nội dung đủ dài để đối chiếu chính xác một bài đăng Facebook.', 'created_at': '2026-08-21T09:00:00Z'}
        matched, error = backend._find_facebook_post_candidate(row, [
            {'id': 'one', 'message': row['content'], 'created_time': '2026-08-21T09:00:10Z'},
            {'id': 'two', 'message': row['content'], 'created_time': '2026-08-21T09:00:30Z'},
        ])
        self.assertIsNone(matched)
        self.assertIn('nhiều bài trùng nội dung', error)

    def test_browser_metrics_accept_zero_and_reject_invalid_values(self):
        self.assertEqual(backend._facebook_dom_metric(0), 0)
        self.assertEqual(backend._facebook_dom_metric('42'), 42)
        self.assertEqual(backend._facebook_dom_metric(-5), 0)
        self.assertIsNone(backend._facebook_dom_metric('không rõ'))

    def test_browser_sync_upgrades_opaque_share_link_to_real_permalink(self):
        row = {
            'id': 'history-1',
            'facebook_post_id': 'opaque-code',
            'target_type': 'group',
            'target_id': '123',
            'post_url': 'https://www.facebook.com/share/p/opaque-code/',
            'content': 'Bài test ngắn',
        }

        with backend.app.test_request_context(
            '/api/facebook-posts/history-1/browser-sync',
            method='POST',
            json={
                'post_url': 'https://www.facebook.com/groups/123/posts/456/',
                'reaction_count': 0,
                'comment_count': 0,
                'share_count': 0,
                'comments': [],
            },
        ):
            with (
                patch.object(backend, '_facebook_post_by_id', return_value=row),
                patch.object(backend, '_current_staff', return_value={'id': 'sale-1'}),
                patch.object(backend, '_save_facebook_post', side_effect=lambda value: (value, '')) as save_mock,
                patch.object(backend, '_store_post_comment_rows', return_value=('local', '')),
            ):
                response = backend.facebook_post_browser_sync('history-1')

        payload = response.get_json()
        self.assertTrue(payload['ok'])
        saved = save_mock.call_args.args[0]
        self.assertEqual(saved['facebook_post_id'], '123_456')
        self.assertEqual(saved['post_url'], 'https://www.facebook.com/groups/123/posts/456/')
        self.assertEqual(saved['total_interactions'], 0)

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
