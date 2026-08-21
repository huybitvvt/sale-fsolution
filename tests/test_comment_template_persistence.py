import unittest
from unittest.mock import patch

import app as backend


class CommentTemplatePersistenceTests(unittest.TestCase):
    def test_create_does_not_mutate_memory_when_supabase_save_fails(self):
        original = [{'id': 'need', 'title': 'Hỏi nhu cầu', 'system': True}]
        with patch.object(backend, '_comment_templates', original.copy()), patch.object(
            backend, 'USE_SUPABASE', True
        ), patch.object(
            backend.sb, 'kv_set', side_effect=RuntimeError('RLS denied')
        ), patch.object(
            backend, '_refresh_comment_templates_from_storage', return_value=''
        ), patch.object(
            backend, '_current_staff_id', return_value='sale-1'
        ), patch.object(
            backend, '_current_staff', return_value={'name': 'Sale One'}
        ), backend.app.test_request_context(
            '/api/comment-templates',
            method='POST',
            json={'title': 'Tư vấn', 'trigger': 'tuvan', 'text': 'Nội dung'},
        ):
            response, status = backend.comment_templates_create()

            self.assertEqual(status, 503)
            self.assertFalse(response.get_json()['ok'])
            self.assertEqual(backend._comment_templates, original)

    def test_create_commits_memory_after_supabase_save_succeeds(self):
        original = [{'id': 'need', 'title': 'Hỏi nhu cầu', 'system': True}]
        with patch.object(backend, '_comment_templates', original.copy()), patch.object(
            backend, 'USE_SUPABASE', True
        ), patch.object(backend.sb, 'kv_set') as save_mock, patch.object(
            backend, '_write_json', return_value=True
        ), patch.object(
            backend, '_refresh_comment_templates_from_storage', return_value=''
        ), patch.object(
            backend, '_current_staff_id', return_value='sale-1'
        ), patch.object(
            backend, '_current_staff', return_value={'name': 'Sale One'}
        ), backend.app.test_request_context(
            '/api/comment-templates',
            method='POST',
            json={'title': 'Tư vấn', 'trigger': 'tuvan', 'text': 'Nội dung'},
        ):
            response = backend.comment_templates_create()

            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.get_json()['ok'])
            self.assertEqual(len(backend._comment_templates), 2)
            save_mock.assert_called_once()
            self.assertEqual(save_mock.call_args.args[0], 'comment_templates')
            self.assertEqual(len(save_mock.call_args.args[1]), 2)

    def test_get_refreshes_templates_from_supabase(self):
        recovered = [{
            'id': 'recovered-1',
            'title': 'Mẫu khôi phục',
            'trigger': 'khoiphuc',
            'text': 'Nội dung cũ',
            'system': False,
        }]
        with patch.object(backend, '_comment_templates', backend._default_comment_templates()), patch.object(
            backend, 'USE_SUPABASE', True
        ), patch.object(
            backend.sb, 'kv_get', return_value=recovered
        ), backend.app.test_request_context('/api/comment-templates'):
            response = backend.comment_templates_get()

            payload = response.get_json()
            self.assertTrue(payload['ok'])
            self.assertEqual(len(payload['templates']), 5)
            self.assertTrue(any(item['id'] == 'recovered-1' for item in payload['templates']))


if __name__ == '__main__':
    unittest.main()
