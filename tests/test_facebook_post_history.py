import unittest
from unittest.mock import Mock, patch

import app as backend


class FacebookPostHistoryTests(unittest.TestCase):
    def test_pipeline_post_message_does_not_append_existing_hashtags_twice(self):
        message = 'e xin test ạ\n\nib\n\n#guitar #guitarsaithanh'
        self.assertEqual(
            backend._pipeline_post_message({
                'content': message,
                'hashtags': '#guitar #guitarsaithanh',
            }),
            message,
        )

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

    def test_history_row_shows_synced_pending_record_as_success(self):
        row = {
            'source': 'chrome_extension',
            'status': 'pending',
            'delivery': 'pending_review',
            'facebook_post_id': '1041963898446955_1041994178443927',
            'post_url': 'https://www.facebook.com/groups/1041963898446955/posts/1041994178443927/',
            'reaction_count': 1,
            'comment_count': 3,
            'share_count': 0,
            'total_interactions': 4,
            'metrics_updated_at': '2026-08-22T13:54:00Z',
        }

        public = backend._facebook_post_history_row(row)

        self.assertEqual(public['status'], 'success')
        self.assertEqual(public['delivery'], 'feed_sync')
        self.assertEqual(public['error_message'], '')
        self.assertEqual(public['published_at'], row['metrics_updated_at'])

    def test_save_normalizes_synced_pending_record_before_persisting(self):
        with (
            patch.object(backend, '_facebook_posts', []),
            patch.object(backend, 'USE_SUPABASE', False),
            patch.object(backend, '_write_json', return_value=True),
        ):
            saved, warning = backend._save_facebook_post({
                'id': 'history-1',
                'external_key': 'chrome:req-1:group:1041963898446955',
                'status': 'pending',
                'delivery': 'submitted',
                'reaction_count': 1,
                'comment_count': 3,
                'share_count': 0,
                'total_interactions': 4,
                'metrics_updated_at': '2026-08-22T13:54:00Z',
            })

        self.assertEqual(warning, '')
        self.assertEqual(saved['status'], 'success')
        self.assertEqual(saved['delivery'], 'feed_sync')

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
        self.assertEqual(
            backend._facebook_group_id_from_url('https://www.facebook.com/groups/damvaydep.net/permalink/3219806054869638/'),
            'damvaydep.net',
        )
        self.assertFalse(backend._facebook_group_ids_conflict('damvaydep.net', '513812408802363'))
        self.assertTrue(backend._facebook_group_ids_conflict('123456', '513812408802363'))
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
                'verified_content': True,
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
        self.assertEqual(saved['status'], 'success')
        self.assertEqual(saved['delivery'], 'extension_verified')
        self.assertTrue(saved['published_at'])
        self.assertEqual(saved['total_interactions'], 0)

    def test_browser_sync_accepts_vanity_group_permalink_for_numeric_target(self):
        row = {
            'id': 'history-1',
            'facebook_post_id': '513812408802363_3219806054869638',
            'target_type': 'group',
            'target_id': '513812408802363',
            'post_url': 'https://www.facebook.com/groups/damvaydep.net/permalink/3219806054869638/',
            'content': 'bán đàn\n\ngita giá 1tr\n\n#guitar #guitarsaithanh',
        }

        with backend.app.test_request_context(
            '/api/facebook-posts/history-1/browser-sync',
            method='POST',
            json={
                'post_url': 'https://www.facebook.com/groups/damvaydep.net/permalink/3219806054869638/',
                'verified_content': True,
                'reaction_count': 1,
                'comment_count': 1,
                'share_count': 0,
                'comments': [{'id': 'comment-1', 'message': 'ib', 'from': {'name': 'Phan Hiếu'}}],
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
        self.assertEqual(saved['post_url'], row['post_url'])
        self.assertEqual(saved['status'], 'success')
        self.assertEqual(saved['total_interactions'], 2)

    def test_feed_sync_uses_group_feed_when_direct_post_metrics_fail(self):
        row = {
            'id': 'history-1',
            'facebook_post_id': '1041963898446955_1041994178443927',
            'target_type': 'group',
            'target_id': '1041963898446955',
            'target_name': 'test nhom',
            'post_url': 'https://www.facebook.com/groups/1041963898446955/posts/1041994178443927/',
            'content': 'test\n\nhi\n\n#guitar #guitarsaithanh',
            'status': 'pending',
        }
        client = Mock(last_graph_error='')
        client.get_post_engagement.return_value = None
        client.get_posts.return_value = [{
            'id': '1041963898446955_1041994178443927',
            'message': row['content'],
            'permalink_url': row['post_url'],
            'created_time': '2026-08-22T10:00:00Z',
            'reactions': {'summary': {'total_count': 1}},
            'comments': {
                'summary': {'total_count': 1},
                'data': [{'id': 'comment-1', 'message': 'ib', 'from': {'id': 'user-1', 'name': 'Phạm Dương'}}],
            },
            'shares': {'count': 0},
        }]
        client.get_post_comments.return_value = {
            'comments': [{'id': 'comment-1', 'message': 'ib', 'from': {'id': 'user-1', 'name': 'Phạm Dương'}}],
            'total_count': 1,
        }

        with backend.app.test_request_context(
            '/api/facebook-posts/history-1/feed-sync',
            method='POST',
            json={'include_comments': True},
        ):
            with (
                patch.object(backend, '_facebook_post_by_id', return_value=row),
                patch.object(backend, 'get_api', return_value=client),
                patch.object(backend, '_current_staff', return_value={'id': 'sale-1'}),
                patch.object(backend, '_save_facebook_post', side_effect=lambda value: (value, '')) as save_mock,
                patch.object(backend, '_store_post_comment_rows', return_value=('local', '')) as store_mock,
            ):
                response = backend.facebook_post_feed_sync('history-1')

        payload = response.get_json()
        self.assertTrue(payload['ok'])
        saved = save_mock.call_args.args[0]
        self.assertEqual(saved['status'], 'success')
        self.assertEqual(saved['delivery'], 'feed_sync')
        self.assertEqual(saved['reaction_count'], 1)
        self.assertEqual(saved['comment_count'], 1)
        self.assertEqual(saved['share_count'], 0)
        self.assertEqual(saved['total_interactions'], 2)
        self.assertEqual(payload['count'], 1)
        store_mock.assert_called_once()

    def test_feed_sync_builds_permalink_when_direct_metrics_omit_url(self):
        row = {
            'id': 'history-1',
            'facebook_post_id': '1041963898446955_1041994178443927',
            'target_type': 'group',
            'target_id': '1041963898446955',
            'target_name': 'test nhom',
            'post_url': '',
            'content': 'test\n\nhi\n\n#guitar #guitarsaithanh',
            'status': 'success',
        }
        client = Mock(last_graph_error='Facebook không trả feed')
        client.get_post_engagement.return_value = {
            'facebook_post_id': row['facebook_post_id'],
            'post_url': '',
            'reaction_count': 1,
            'comment_count': 1,
            'share_count': 0,
        }
        client.get_posts.return_value = None

        with backend.app.test_request_context(
            '/api/facebook-posts/history-1/feed-sync',
            method='POST',
            json={'include_comments': False},
        ):
            with (
                patch.object(backend, '_facebook_post_by_id', return_value=row),
                patch.object(backend, 'get_api', return_value=client),
                patch.object(backend, '_current_staff', return_value={'id': 'sale-1'}),
                patch.object(backend, '_save_facebook_post', side_effect=lambda value: (value, '')) as save_mock,
                patch.object(backend, '_store_post_comment_rows', return_value=('local', '')),
            ):
                response = backend.facebook_post_feed_sync('history-1')

        payload = response.get_json()
        self.assertTrue(payload['ok'])
        saved = save_mock.call_args.args[0]
        self.assertEqual(
            saved['post_url'],
            'https://www.facebook.com/groups/1041963898446955/posts/1041994178443927/',
        )
        self.assertEqual(saved['total_interactions'], 2)

    def test_feed_sync_merges_feed_when_direct_metrics_are_partial(self):
        row = {
            'id': 'history-1',
            'facebook_post_id': '1041963898446955_1041994178443927',
            'target_type': 'group',
            'target_id': '1041963898446955',
            'target_name': 'test nhom',
            'post_url': 'https://www.facebook.com/groups/1041963898446955/posts/1041994178443927/',
            'content': 'test\n\nhi\n\n#guitar #guitarsaithanh',
            'status': 'success',
        }
        client = Mock(last_graph_error='')
        client.get_post_engagement.return_value = {
            'facebook_post_id': row['facebook_post_id'],
            'post_url': row['post_url'],
            'reaction_count': 1,
            'comment_count': None,
            'share_count': 0,
        }
        client.get_posts.return_value = [{
            'id': row['facebook_post_id'],
            'message': row['content'],
            'permalink_url': row['post_url'],
            'created_time': '2026-08-22T10:00:00Z',
            'reactions': {'summary': {'total_count': 1}},
            'comments': {
                'summary': {'total_count': 3},
                'data': [{'id': 'comment-1', 'message': 'ib', 'from': {'id': 'user-1', 'name': 'Phạm Dương'}}],
            },
            'shares': {'count': 0},
        }]
        client.get_post_comments.return_value = None

        with backend.app.test_request_context(
            '/api/facebook-posts/history-1/feed-sync',
            method='POST',
            json={'include_comments': True},
        ):
            with (
                patch.object(backend, '_facebook_post_by_id', return_value=row),
                patch.object(backend, 'get_api', return_value=client),
                patch.object(backend, '_current_staff', return_value={'id': 'sale-1'}),
                patch.object(backend, '_save_facebook_post', side_effect=lambda value: (value, '')) as save_mock,
                patch.object(backend, '_store_post_comment_rows', return_value=('local', '')),
            ):
                response = backend.facebook_post_feed_sync('history-1')

        payload = response.get_json()
        self.assertTrue(payload['ok'])
        saved = save_mock.call_args.args[0]
        self.assertEqual(saved['reaction_count'], 1)
        self.assertEqual(saved['comment_count'], 3)
        self.assertEqual(saved['share_count'], 0)
        self.assertEqual(saved['total_interactions'], 4)
        self.assertEqual(payload['total_count'], 3)

    def test_manual_reference_can_be_verified_by_feed_without_extension(self):
        row = {
            'id': 'history-1',
            'target_type': 'group',
            'target_id': '123',
            'target_name': 'test nhom',
            'content': 'Bài test cần gắn link',
            'status': 'pending',
        }
        client = Mock(last_graph_error='')
        client.get_posts.return_value = [{
            'id': '123_456',
            'message': row['content'],
            'permalink_url': 'https://www.facebook.com/groups/123/posts/456/',
            'created_time': '2026-08-22T10:00:00Z',
        }]

        with backend.app.test_request_context(
            '/api/facebook-posts/history-1/reference',
            method='POST',
            json={
                'post_url': 'https://www.facebook.com/groups/123/posts/456/',
                'delivery': 'manual_reference',
                'verify_with_feed': True,
            },
        ):
            with (
                patch.object(backend, '_facebook_post_by_id', return_value=row),
                patch.object(backend, 'get_api', return_value=client),
                patch.object(backend, '_save_facebook_post', side_effect=lambda value: (value, '')) as save_mock,
            ):
                response = backend.facebook_post_reference_save('history-1')

        payload = response.get_json()
        self.assertTrue(payload['ok'])
        saved = save_mock.call_args.args[0]
        self.assertEqual(saved['facebook_post_id'], '123_456')
        self.assertEqual(saved['post_url'], 'https://www.facebook.com/groups/123/posts/456/')
        self.assertEqual(saved['status'], 'success')
        self.assertEqual(saved['delivery'], 'manual_reference')

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

                backend._record_publish_results(
                    {'content': 'Bài Group chờ xác nhận'},
                    [{'type': 'group', 'id': 'group-1', 'name': 'Nhóm A'}],
                    {'ok': True, 'results': [{
                        'ok': True,
                        'type': 'group',
                        'id': 'group-1',
                        'delivery': 'submitted',
                        'post_id': 'group-1_post-1',
                    }]},
                    source='chrome_extension', request_id='req-group-submitted',
                )
                self.assertEqual(saved[-1]['status'], 'pending')
                self.assertIsNone(saved[-1]['published_at'])

    def test_mark_pending_review_clears_wrong_group_reference_and_metrics(self):
        row = {
            'id': 'history-1',
            'external_key': 'chrome:req-1:group:123',
            'target_type': 'group',
            'target_id': '123',
            'facebook_post_id': '123_456',
            'post_url': 'https://www.facebook.com/groups/123/posts/456/',
            'status': 'success',
            'delivery': 'published',
            'reaction_count': 8,
            'comment_count': 3,
            'share_count': 1,
            'total_interactions': 12,
            'metrics_updated_at': '2026-08-22T10:00:00Z',
            'published_at': '2026-08-22T09:59:00Z',
        }
        with backend.app.test_request_context(
            '/api/facebook-posts/history-1/pending-review', method='POST',
        ):
            with (
                patch.object(backend, '_facebook_post_by_id', return_value=row),
                patch.object(backend, '_save_facebook_post', side_effect=lambda value: (value, '')) as save_mock,
            ):
                response = backend.facebook_post_mark_pending_review('history-1')

        payload = response.get_json()
        self.assertTrue(payload['ok'])
        saved = save_mock.call_args.args[0]
        self.assertIsNone(saved['facebook_post_id'])
        self.assertEqual(saved['post_url'], '')
        self.assertEqual(saved['status'], 'pending')
        self.assertEqual(saved['delivery'], 'pending_review')
        self.assertIsNone(saved['total_interactions'])
        self.assertIsNone(saved['published_at'])

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

    def test_store_post_comments_creates_leads_for_all_commenters(self):
        comment = {
            'source': 'facebook',
            'post_id': 'group-1_post-1',
            'group_id': 'group-1',
            'post_url': 'https://www.facebook.com/groups/group-1/posts/post-1/',
            'comment_id': 'comment-no-phone',
            'author_id': 'user-2',
            'author_name': 'Trần B',
            'message': 'Cho mình xin demo phần mềm',
        }
        with (
            patch.object(backend, '_post_comments', []),
            patch.object(backend, '_leads', {}),
            patch.object(backend, '_save_post_comments'),
            patch.object(backend, '_save_leads'),
            patch.object(backend, '_save_leads_to_supabase', return_value=(True, '')) as save_leads,
            patch.object(backend, '_save_post_comment_rows_to_supabase', return_value=(True, '')),
        ):
            storage, warning = backend._store_post_comment_rows([comment])
            saved_leads = save_leads.call_args.args[0]
            lead = saved_leads[0]

            self.assertEqual(storage, 'supabase')
            self.assertEqual(warning, '')
            self.assertEqual(len(saved_leads), 1)
            self.assertEqual(lead['comment_id'], 'comment-no-phone')
            self.assertEqual(lead['comment_author'], 'Trần B')
            self.assertEqual(lead['comment_text'], 'Cho mình xin demo phần mềm')
            self.assertEqual(lead['facebook_uid'], 'user-2')
            self.assertEqual(lead['phone'], '')
            self.assertEqual(lead['contact_status'], 'no_phone')
            self.assertEqual(backend._leads['group-1_post-1'][0]['comment_id'], 'comment-no-phone')

    def test_messenger_sync_payload_dedupes_and_persists_visible_messages(self):
        payload = {
            'conversation_url': 'https://www.messenger.com/t/123456789',
            'conversation_title': 'Nguyễn Khách',
            'participants': [
                {'id': '61560853200267', 'name': 'Phạm Dương', 'profile_url': 'https://www.facebook.com/me'},
                {'id': '1000000001', 'name': 'Nguyễn Khách', 'profile_url': 'https://www.facebook.com/1000000001'},
            ],
            'messages': [
                {'message_id': 'sys1', 'sender_name': 'Messenger', 'text': 'Các bạn không phải là bạn bè trên Facebook'},
                {'message_id': 'placeholder', 'sender_name': 'Khách hàng', 'text': 'Soạn'},
                {'message_id': 'm1', 'sender_id': '1000000001', 'sender_name': 'Nguyễn Khách', 'text': 'Cho mình xin demo 0912345678', 'sent_at': '2026-08-28T01:00:00Z', 'display_time': '08:00 28/8/2026'},
                {'message_id': 'm1', 'sender_id': '1000000001', 'sender_name': 'Nguyễn Khách', 'text': 'Cho mình xin demo 0912345678', 'sent_at': '2026-08-28T01:00:00Z', 'display_time': '08:00 28/8/2026'},
                {'message_id': 'm2', 'sender_is_self': True, 'sender_name': 'Phạm Dương', 'text': 'Em gửi demo ngay ạ', 'sent_at': '2026-08-28T01:01:00Z'},
            ],
        }

        stored_threads = {}
        with backend.app.test_request_context('/'):
            with (
                patch.object(backend, '_messenger_threads', {'conversations': [], 'messages': []}),
                patch.object(backend, '_current_staff', return_value={'id': 'sale-1', 'name': 'Phạm Dương', 'username': 'sale1'}),
                patch.object(backend, 'USE_SUPABASE', False),
                patch.object(backend, '_save_messenger_threads'),
            ):
                conversation, messages, warning = backend._store_messenger_sync_payload(payload)
                stored_threads = backend._messenger_threads

        self.assertEqual(warning, '')
        self.assertEqual(conversation['conversation_id'], '123456789')
        self.assertTrue(conversation['conversation_key'])
        self.assertEqual(conversation['owner_key'], 'sale-1')
        self.assertEqual(conversation['customer_id'], '1000000001')
        self.assertEqual(conversation['customer_name'], 'Nguyễn Khách')
        self.assertEqual(conversation['customer_phone'], '0912345678')
        self.assertEqual(len(messages), 2)
        self.assertEqual(messages[0]['conversation_key'], conversation['conversation_key'])
        self.assertEqual(messages[0]['owner_key'], 'sale-1')
        self.assertEqual(messages[0]['sender_type'], 'customer')
        self.assertEqual(messages[0]['phone'], '0912345678')
        self.assertEqual(messages[0]['display_time'], '08:00 28/8/2026')
        self.assertEqual(messages[1]['direction'], 'outgoing')
        self.assertNotIn('Soạn', [item['text'] for item in messages])
        self.assertEqual(len(stored_threads['messages']), 2)

    def test_messenger_threads_are_scoped_by_staff_for_admin_filter(self):
        payload = {
            'conversation_url': 'https://www.messenger.com/t/123456789',
            'conversation_title': 'Khách chung',
            'messages': [
                {'message_id': 'm1', 'sender_name': 'Khách chung', 'text': 'Xin demo', 'sent_at': '2026-08-28T01:00:00Z'},
            ],
        }
        sale_a = {'id': 'sale-a', 'name': 'Sale A', 'username': 'salea', 'role': 'staff'}
        sale_b = {'id': 'sale-b', 'name': 'Sale B', 'username': 'saleb', 'role': 'staff'}
        admin = {'id': 'admin-1', 'name': 'Admin', 'username': 'admin', 'role': 'admin'}

        with backend.app.test_request_context('/'):
            with (
                patch.object(backend, '_messenger_threads', {'conversations': [], 'messages': []}),
                patch.object(backend, 'USE_SUPABASE', False),
                patch.object(backend, '_save_messenger_threads'),
                patch.object(backend, '_merged_public_staff_rows', return_value=([sale_a, sale_b, admin], '')),
            ):
                with patch.object(backend, '_current_staff', return_value=sale_a):
                    conv_a, _, _ = backend._store_messenger_sync_payload(payload)
                with patch.object(backend, '_current_staff', return_value=sale_b):
                    conv_b, _, _ = backend._store_messenger_sync_payload(payload)

                self.assertNotEqual(conv_a['conversation_key'], conv_b['conversation_key'])
                self.assertEqual(len(backend._messenger_threads['conversations']), 2)
                self.assertEqual(len(backend._messenger_threads['messages']), 2)

                with patch.object(backend, '_current_staff', return_value=admin):
                    all_convs, _, _ = backend._load_messenger_threads(limit=50)
                    sale_a_convs, sale_a_messages, _ = backend._load_messenger_threads(staff_id='sale-a', limit=50)
                    sale_b_convs, sale_b_messages, _ = backend._load_messenger_threads(staff_id='sale-b', limit=50)

                with patch.object(backend, '_current_staff', return_value=sale_a):
                    self_convs, self_messages, _ = backend._load_messenger_threads(limit=50)

        self.assertEqual(len(all_convs), 2)
        self.assertEqual([item['owner_key'] for item in sale_a_convs], ['sale-a'])
        self.assertEqual([item['owner_key'] for item in sale_b_convs], ['sale-b'])
        self.assertEqual([item['owner_key'] for item in self_convs], ['sale-a'])
        self.assertEqual(len(sale_a_messages), 1)
        self.assertEqual(len(sale_b_messages), 1)
        self.assertEqual(len(self_messages), 1)

    def test_messenger_sync_route_rejects_empty_visible_thread(self):
        with backend.app.test_request_context('/api/messenger/sync', method='POST', json={
            'conversation_url': 'https://www.messenger.com/t/empty-thread',
            'messages': [],
        }):
            with (
                patch.object(backend, '_messenger_threads', {'conversations': [], 'messages': []}),
                patch.object(backend, '_current_staff', return_value={'id': 'sale-1'}),
                patch.object(backend, 'USE_SUPABASE', False),
                patch.object(backend, '_save_messenger_threads'),
            ):
                response, status = backend.messenger_sync_from_extension()

        payload = response.get_json()
        self.assertEqual(status, 422)
        self.assertFalse(payload['ok'])
        self.assertIn('Extension chưa đọc được tin nhắn', payload['error'])

    def test_messenger_delete_conversation_removes_selected_thread_only(self):
        base_payload = {
            'conversation_url': 'https://www.messenger.com/t/example',
            'participants': [{'name': 'Khách Messenger'}],
        }
        staff = {'id': 'sale-1', 'name': 'Sale A', 'username': 'salea', 'role': 'staff'}

        with backend.app.test_request_context('/'):
            with (
                patch.object(backend, '_messenger_threads', {'conversations': [], 'messages': []}),
                patch.object(backend, '_current_staff', return_value=staff),
                patch.object(backend, 'USE_SUPABASE', False),
                patch.object(backend, '_save_messenger_threads'),
            ):
                conversation_a, _, _ = backend._store_messenger_sync_payload({
                    **base_payload,
                    'conversation_id': 'messenger-thread-a',
                    'conversation_title': 'Khách A',
                    'messages': [{'message_id': 'a1', 'sender_name': 'Khách A', 'text': 'Tin A'}],
                })
                conversation_b, _, _ = backend._store_messenger_sync_payload({
                    **base_payload,
                    'conversation_id': 'messenger-thread-b',
                    'conversation_title': 'Khách B',
                    'messages': [{'message_id': 'b1', 'sender_name': 'Khách B', 'text': 'Tin B'}],
                })

                payload, status = backend._delete_messenger_conversation(conversation_a['conversation_key'])
                remaining_keys = [
                    item['conversation_key']
                    for item in backend._messenger_threads['conversations']
                ]
                remaining_texts = [
                    item['text']
                    for item in backend._messenger_threads['messages']
                ]

        self.assertEqual(status, 200)
        self.assertTrue(payload['ok'])
        self.assertEqual(payload['deleted_local_conversations'], 1)
        self.assertEqual(payload['deleted_local_messages'], 1)
        self.assertEqual(remaining_keys, [conversation_b['conversation_key']])
        self.assertEqual(remaining_texts, ['Tin B'])

    def test_zalo_sync_payload_filters_placeholders_and_scopes_staff(self):
        payload = {
            'conversation_url': 'https://chat.zalo.me/',
            'conversation_id': 'zalo-thread-1',
            'conversation_title': 'Khách Zalo',
            'participants': [{'name': 'Khách Zalo'}],
            'messages': [
                {'message_id': 'placeholder', 'sender_name': 'Khách hàng', 'text': 'Soạn'},
                {'message_id': 'icon-noise', 'sender_is_self': True, 'sender_name': 'Sale A', 'text': '/-strong /-heart > :o :-(( :-h'},
                {'message_id': 'm1', 'sender_name': 'Khách Zalo', 'text': 'Tư vấn demo 0912345678', 'display_time': '09:00'},
                {'message_id': 'm2', 'sender_is_self': True, 'sender_name': 'Sale A', 'text': 'Em gửi demo ngay ạ', 'display_time': '09:01'},
                {'message_id': 'm3', 'sender_name': 'Khách Zalo', 'text': '[Ảnh]', 'display_time': '09:02', 'media_urls': ['https://example.com/a.jpg']},
            ],
        }

        with backend.app.test_request_context('/'):
            with (
                patch.object(backend, '_zalo_threads', {'conversations': [], 'messages': []}),
                patch.object(backend, '_current_staff', return_value={'id': 'sale-1', 'name': 'Sale A', 'username': 'salea'}),
                patch.object(backend, 'USE_SUPABASE', False),
                patch.object(backend, '_save_zalo_threads'),
            ):
                conversation, messages, warning = backend._store_zalo_sync_payload(payload)
                stored_threads = backend._zalo_threads

        self.assertEqual(warning, '')
        self.assertEqual(conversation['conversation_id'], 'zalo-thread-1')
        self.assertEqual(conversation['source'], 'zalo_web_dom')
        self.assertEqual(conversation['owner_key'], 'sale-1')
        self.assertEqual(conversation['customer_name'], 'Khách Zalo')
        self.assertEqual(conversation['customer_phone'], '0912345678')
        self.assertEqual(len(messages), 3)
        self.assertNotIn('Soạn', [item['text'] for item in messages])
        self.assertNotIn('/-strong /-heart > :o :-(( :-h', [item['text'] for item in messages])
        self.assertEqual(messages[0]['sender_type'], 'customer')
        self.assertEqual(messages[0]['phone'], '0912345678')
        self.assertEqual(messages[1]['direction'], 'outgoing')
        self.assertEqual(messages[2]['raw_message']['media_urls'], ['https://example.com/a.jpg'])
        self.assertEqual(len(stored_threads['messages']), 3)

    def test_zalo_dom_cleanup_removes_reply_controls_and_recovers_time(self):
        cleaned = backend._clean_zalo_dom_message({
            'text': '400 b 15:08 /-strong /-heart :> :o :-(( :-h',
        })

        self.assertEqual(cleaned['text'], '400 b')
        self.assertEqual(cleaned['display_time'], '15:08')
        scheduled = backend._clean_zalo_dom_message({'text': 'Hẹn lúc 15:08', 'display_time': '16:20'})
        self.assertEqual(scheduled['text'], 'Hẹn lúc 15:08')
        self.assertTrue(backend._is_zalo_legacy_polluted_message({
            'text': 'Nguyễn Doãn Huy Bhf giá sao thế bác 400 b 15:08 /-strong /-heart :o',
        }))
        self.assertFalse(backend._is_zalo_legacy_polluted_message({'text': '400 b'}))

    def test_zalo_media_upload_uses_deterministic_cloudinary_path(self):
        image = Mock(filename='zalo.png', mimetype='image/png')
        image.read.return_value = b'zalo-image-bytes'
        response = Mock(status_code=200, headers={'content-type': 'application/json'})
        response.json.return_value = {
            'secure_url': 'https://res.cloudinary.com/demo/image/upload/v1/eco-transport/zalo/sale-1/image.png',
        }

        with (
            patch.object(backend, 'CLOUDINARY_CLOUD_NAME', 'demo'),
            patch.object(backend, 'CLOUDINARY_API_KEY', 'api-key'),
            patch.object(backend, 'CLOUDINARY_API_SECRET', 'api-secret'),
            patch.object(backend, 'CLOUDINARY_FOLDER', 'eco-transport'),
            patch.object(backend, '_current_staff_id', return_value='sale-1'),
            patch.object(backend.time_module, 'time', return_value=1234567890),
            patch.object(backend._req, 'post', return_value=response) as post,
        ):
            image_url, error = backend._upload_zalo_media_to_cloudinary(image)

        self.assertEqual(error, '')
        self.assertTrue(image_url.startswith('https://res.cloudinary.com/'))
        self.assertEqual(post.call_args.args[0], 'https://api.cloudinary.com/v1_1/demo/image/upload')
        self.assertEqual(post.call_args.kwargs['data']['folder'], 'eco-transport/zalo/sale-1')
        self.assertEqual(post.call_args.kwargs['data']['timestamp'], '1234567890')
        self.assertEqual(post.call_args.kwargs['files']['file'][1], b'zalo-image-bytes')
        self.assertNotIn('api-secret', str(post.call_args))

    def test_zalo_sync_keeps_stable_conversation_and_merges_duplicate_dom_bubbles(self):
        staff = {'id': 'sale-1', 'name': 'Sale A', 'username': 'salea'}
        first_payload = {
            'conversation_url': 'https://chat.zalo.me/',
            'conversation_id': 'zalo_dom_stable_customer_1',
            'conversation_title': 'Nguyễn Doãn Huy',
            'customer_name': 'Nguyễn Doãn Huy',
            'messages': [
                {
                    'message_id': 'unstable-root-a',
                    'sender_is_self': True,
                    'text': 'bác còn gpt k ạ',
                    'display_time': '17:58',
                },
                {
                    'message_id': 'unstable-root-b',
                    'sender_is_self': True,
                    'text': 'bác còn gpt k ạ',
                    'display_time': '17:58',
                },
            ],
        }
        corrected_payload = {
            **first_payload,
            'conversation_title': 'Duyy',
            'customer_name': 'Duyy',
            'messages': [
                {
                    'message_id': 'stable-message-1',
                    'sender_is_self': True,
                    'text': 'bác còn gpt k ạ',
                    'display_time': '17:58 18/8/2026',
                    'sent_at': '2026-08-18T10:58:00Z',
                },
                {
                    'message_id': 'stable-message-2',
                    'sender_name': 'Khách hàng',
                    'text': '60 a',
                    'display_time': '18:10 18/8/2026',
                    'sent_at': '2026-08-18T11:10:00Z',
                },
            ],
        }

        with backend.app.test_request_context('/'):
            with (
                patch.object(backend, '_zalo_threads', {'conversations': [], 'messages': []}),
                patch.object(backend, '_current_staff', return_value=staff),
                patch.object(backend, 'USE_SUPABASE', False),
                patch.object(backend, '_save_zalo_threads'),
            ):
                first_conversation, first_messages, _ = backend._store_zalo_sync_payload(first_payload)
                corrected_conversation, _, _ = backend._store_zalo_sync_payload(corrected_payload)
                conversations, loaded_messages, _ = backend._load_zalo_threads(
                    conversation_key=corrected_conversation['conversation_key'],
                    limit=20,
                )
                stored_threads = backend._zalo_threads

        self.assertEqual(first_conversation['conversation_key'], corrected_conversation['conversation_key'])
        self.assertEqual(len(first_messages), 1)
        self.assertEqual(len(stored_threads['conversations']), 1)
        self.assertEqual(stored_threads['conversations'][0]['customer_name'], 'Duyy')
        self.assertEqual(stored_threads['conversations'][0]['message_count'], 2)
        self.assertEqual(len(stored_threads['messages']), 2)
        self.assertEqual(conversations[0]['customer_name'], 'Duyy')
        self.assertEqual([row['text'] for row in loaded_messages], ['bác còn gpt k ạ', '60 a'])
        self.assertEqual(loaded_messages[0]['display_time'], '17:58 18/8/2026')

    def test_zalo_sync_removes_messages_marked_as_reply_quotes(self):
        staff = {'id': 'sale-1', 'name': 'Sale A', 'username': 'salea'}
        base_payload = {
            'conversation_url': 'https://chat.zalo.me/',
            'conversation_id': 'zalo-thread-replies',
            'conversation_title': 'Duyy',
            'customer_name': 'Duyy',
        }

        with backend.app.test_request_context('/'):
            with (
                patch.object(backend, '_zalo_threads', {'conversations': [], 'messages': []}),
                patch.object(backend, '_current_staff', return_value=staff),
                patch.object(backend, 'USE_SUPABASE', False),
                patch.object(backend, '_save_zalo_threads'),
            ):
                backend._store_zalo_sync_payload({
                    **base_payload,
                    'messages': [
                        {'message_id': 'normal-1', 'sender_name': 'Duyy', 'text': '100 b'},
                        {'message_id': 'reply-1', 'sender_is_self': True, 'text': 'Duyy 100 b Bhf giá sao thế bác'},
                    ],
                })
                conversation, messages, warning = backend._store_zalo_sync_payload({
                    **base_payload,
                    'messages': [{'message_id': 'normal-1', 'sender_name': 'Duyy', 'text': '100 b'}],
                    'ignored_message_ids': ['reply-1'],
                    'skipped_reply_count': 1,
                })
                stored_messages = list(backend._zalo_threads['messages'])

        self.assertEqual(warning, '')
        self.assertEqual([row['text'] for row in stored_messages], ['100 b'])
        self.assertEqual([row['text'] for row in messages], ['100 b'])
        self.assertEqual(conversation['message_count'], 1)

    def test_zalo_delete_conversation_removes_selected_thread_only(self):
        base_payload = {
            'conversation_url': 'https://chat.zalo.me/',
            'participants': [{'name': 'Khách Zalo'}],
        }
        staff = {'id': 'sale-1', 'name': 'Sale A', 'username': 'salea'}

        with backend.app.test_request_context('/'):
            with (
                patch.object(backend, '_zalo_threads', {'conversations': [], 'messages': []}),
                patch.object(backend, '_current_staff', return_value=staff),
                patch.object(backend, 'USE_SUPABASE', False),
                patch.object(backend, '_save_zalo_threads'),
            ):
                conversation_a, _, _ = backend._store_zalo_sync_payload({
                    **base_payload,
                    'conversation_id': 'zalo-thread-a',
                    'conversation_title': 'Khách A',
                    'messages': [{'message_id': 'a1', 'sender_name': 'Khách A', 'text': 'Tin A'}],
                })
                conversation_b, _, _ = backend._store_zalo_sync_payload({
                    **base_payload,
                    'conversation_id': 'zalo-thread-b',
                    'conversation_title': 'Khách B',
                    'messages': [{'message_id': 'b1', 'sender_name': 'Khách B', 'text': 'Tin B'}],
                })

                payload, status = backend._delete_zalo_conversation(conversation_a['conversation_key'])
                remaining_keys = [
                    item['conversation_key']
                    for item in backend._zalo_threads['conversations']
                ]
                remaining_texts = [
                    item['text']
                    for item in backend._zalo_threads['messages']
                ]

        self.assertEqual(status, 200)
        self.assertTrue(payload['ok'])
        self.assertEqual(payload['deleted_local_conversations'], 1)
        self.assertEqual(payload['deleted_local_messages'], 1)
        self.assertEqual(remaining_keys, [conversation_b['conversation_key']])
        self.assertEqual(remaining_texts, ['Tin B'])

    def test_zalo_group_requires_admin_approval_before_sync(self):
        staff = {'id': 'sale-1', 'name': 'Sale A', 'username': 'salea'}
        group_payload = {
            'conversation_url': 'https://chat.zalo.me/',
            'conversation_id': 'zalo-group-1',
            'conversation_title': 'Nhóm khách hàng VIP',
            'conversation_type': 'group',
            'is_group': True,
            'group_evidence': 'group_header',
        }

        with backend.app.test_request_context('/'):
            with (
                patch.object(backend, '_zalo_threads', {'conversations': [], 'messages': [], 'sync_targets': []}),
                patch.object(backend, '_current_staff', return_value=staff),
                patch.object(backend, '_is_admin', return_value=False),
                patch.object(backend, 'USE_SUPABASE', False),
                patch.object(backend, '_save_zalo_threads'),
            ):
                private_target, private_error = backend._register_zalo_sync_target({
                    **group_payload,
                    'conversation_type': 'private',
                    'is_group': False,
                })
                pending, warning = backend._register_zalo_sync_target(group_payload)
                unknown_candidate, unknown_warning = backend._register_zalo_sync_target({
                    **group_payload,
                    'conversation_id': 'zalo-group-unknown',
                    'conversation_type': 'unknown',
                    'is_group': False,
                    'is_group_candidate': True,
                })
                with patch.object(backend, '_is_admin', return_value=True):
                    approved, approve_warning = backend._set_zalo_sync_target_status(
                        pending['target_key'],
                        'approved',
                    )
                registered_again, repeat_warning = backend._register_zalo_sync_target(group_payload)
                approved_conversation, _, _ = backend._store_zalo_sync_payload({
                    **group_payload,
                    'messages': [{'message_id': 'g1', 'sender_name': 'Khách nhóm', 'text': 'Tin trong nhóm'}],
                })
                backend._store_zalo_sync_payload({
                    'conversation_url': 'https://chat.zalo.me/',
                    'conversation_id': 'zalo-private-legacy',
                    'conversation_title': 'Chat riêng cũ',
                    'messages': [{'message_id': 'p1', 'sender_name': 'Khách riêng', 'text': 'Tin riêng'}],
                })
                visible_conversations, visible_messages, _ = backend._load_zalo_threads(
                    blocked_conversation_keys={unknown_candidate['target_key']},
                )
                stored_targets = list(backend._zalo_threads['sync_targets'])

        self.assertEqual(private_target, {})
        self.assertIn('không cần đăng ký duyệt nhóm', private_error)
        self.assertEqual(warning, '')
        self.assertEqual(pending['approval_status'], 'pending')
        self.assertEqual(unknown_warning, '')
        self.assertEqual(unknown_candidate['approval_status'], 'pending')
        self.assertFalse(unknown_candidate['is_group'])
        self.assertEqual(approve_warning, '')
        self.assertEqual(approved['approval_status'], 'approved')
        self.assertEqual(repeat_warning, '')
        self.assertEqual(registered_again['approval_status'], 'approved')
        self.assertEqual(len(stored_targets), 2)
        self.assertEqual(
            {row['title'] for row in visible_conversations},
            {'Nhóm khách hàng VIP', 'Chat riêng cũ'},
        )
        self.assertIn(visible_messages[0]['text'], {'Tin trong nhóm', 'Tin riêng'})

    def test_zalo_private_chat_syncs_without_admin_approval(self):
        staff = {'id': 'sale-1', 'name': 'Sale A', 'username': 'salea', 'role': 'staff'}
        payload = {
            'conversation_url': 'https://chat.zalo.me/',
            'conversation_id': 'zalo-private-1',
            'conversation_title': 'Khách riêng',
            'conversation_type': 'private',
            'is_group': False,
            'is_group_candidate': False,
            'group_evidence': 'private_header',
            'messages': [{'message_id': 'private-1', 'sender_name': 'Khách riêng', 'text': 'Tin nhắn riêng'}],
        }
        client = backend.app.test_client()

        with (
            patch.object(backend, '_zalo_threads', {'conversations': [], 'messages': [], 'sync_targets': []}),
            patch.object(backend, '_current_staff', return_value=staff),
            patch.object(backend, '_is_admin', return_value=False),
            patch.object(backend, 'USE_SUPABASE', False),
            patch.object(backend, '_save_zalo_threads'),
        ):
            target_key, _, _ = backend._zalo_sync_target_identity(payload)
            backend._zalo_threads['sync_targets'] = [{
                'target_key': target_key,
                'conversation_id': payload['conversation_id'],
                'title': payload['conversation_title'],
                'is_group': False,
                'approval_status': 'pending',
                'owner_key': 'sale-1',
            }]
            authorize_response = client.post('/api/zalo/sync/authorize', json=payload)
            sync_response = client.post('/api/zalo/sync', json=payload)
            stored = {
                'conversations': list(backend._zalo_threads['conversations']),
                'messages': list(backend._zalo_threads['messages']),
                'sync_targets': list(backend._zalo_threads['sync_targets']),
            }

        self.assertEqual(authorize_response.status_code, 200)
        self.assertTrue(authorize_response.get_json()['private_chat'])
        self.assertEqual(sync_response.status_code, 200)
        self.assertTrue(sync_response.get_json()['ok'])
        self.assertEqual([row['title'] for row in stored['conversations']], ['Khách riêng'])
        self.assertEqual([row['text'] for row in stored['messages']], ['Tin nhắn riêng'])
        self.assertEqual(stored['sync_targets'], [])

    def test_zalo_private_classification_cannot_bypass_a_blocked_group(self):
        staff = {'id': 'sale-1', 'name': 'Sale A', 'username': 'salea', 'role': 'staff'}
        payload = {
            'conversation_url': 'https://chat.zalo.me/',
            'conversation_id': 'zalo-protected-group',
            'conversation_title': 'Nhóm đã chặn',
            'conversation_type': 'private',
            'is_group': False,
            'is_group_candidate': False,
            'messages': [{'message_id': 'blocked-1', 'sender_name': 'Thành viên', 'text': 'Không được lưu'}],
        }
        client = backend.app.test_client()

        with (
            patch.object(backend, '_zalo_threads', {'conversations': [], 'messages': [], 'sync_targets': []}),
            patch.object(backend, '_current_staff', return_value=staff),
            patch.object(backend, '_is_admin', return_value=False),
            patch.object(backend, 'USE_SUPABASE', False),
            patch.object(backend, '_save_zalo_threads'),
        ):
            target_key, _, _ = backend._zalo_sync_target_identity(payload)
            backend._zalo_threads['sync_targets'] = [{
                'target_key': target_key,
                'conversation_id': payload['conversation_id'],
                'title': payload['conversation_title'],
                'is_group': True,
                'approval_status': 'blocked',
                'approved_at': '2026-08-30T00:00:00Z',
                'owner_key': 'sale-1',
            }]
            authorize_response = client.post('/api/zalo/sync/authorize', json=payload)
            sync_response = client.post('/api/zalo/sync', json=payload)
            stored = {
                'conversations': list(backend._zalo_threads['conversations']),
                'messages': list(backend._zalo_threads['messages']),
            }

        self.assertEqual(authorize_response.status_code, 409)
        self.assertTrue(authorize_response.get_json()['approval_required'])
        self.assertEqual(sync_response.status_code, 409)
        self.assertEqual(stored, {'conversations': [], 'messages': []})

    def test_zalo_sync_api_does_not_store_messages_while_group_is_pending(self):
        staff = {'id': 'sale-1', 'name': 'Sale A', 'username': 'salea', 'role': 'staff'}
        payload = {
            'conversation_url': 'https://chat.zalo.me/',
            'conversation_id': 'zalo-group-pending',
            'conversation_title': 'Nhóm đang chờ duyệt',
            'conversation_type': 'group',
            'is_group': True,
            'is_group_candidate': True,
            'messages': [{'message_id': 'secret-1', 'sender_name': 'Thành viên', 'text': 'Nội dung chưa được duyệt'}],
        }
        client = backend.app.test_client()

        with (
            patch.object(backend, '_zalo_threads', {'conversations': [], 'messages': [], 'sync_targets': []}),
            patch.object(backend, '_current_staff', return_value=staff),
            patch.object(backend, '_is_admin', return_value=False),
            patch.object(backend, 'USE_SUPABASE', False),
            patch.object(backend, '_save_zalo_threads'),
        ):
            authorize_response = client.post('/api/zalo/sync/authorize', json=payload)
            sync_response = client.post('/api/zalo/sync', json=payload)
            stored_before_approval = {
                'conversations': list(backend._zalo_threads['conversations']),
                'messages': list(backend._zalo_threads['messages']),
            }
            target_key = backend._zalo_threads['sync_targets'][0]['target_key']
            with patch.object(backend, '_is_admin', return_value=True):
                backend._set_zalo_sync_target_status(target_key, 'approved')
            approved_response = client.post('/api/zalo/sync', json=payload)

        self.assertEqual(authorize_response.status_code, 409)
        self.assertTrue(authorize_response.get_json()['approval_required'])
        self.assertEqual(sync_response.status_code, 409)
        self.assertEqual(stored_before_approval, {'conversations': [], 'messages': []})
        self.assertEqual(approved_response.status_code, 200)
        self.assertTrue(approved_response.get_json()['ok'])


if __name__ == '__main__':
    unittest.main()
