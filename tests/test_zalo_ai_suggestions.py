import json
import unittest
from unittest.mock import Mock, patch

import app as backend
from core.ai_classifier import AIClassifier


class ZaloAiSuggestionTests(unittest.TestCase):
    def setUp(self):
        self.staff = {'id': 'sale-1', 'name': 'Sale A', 'username': 'salea', 'role': 'staff'}
        self.threads = {'conversations': [], 'messages': [], 'sync_targets': [], 'suggestions': []}

    def _store_private_conversation(self):
        return backend._store_zalo_sync_payload({
            'conversation_url': 'https://chat.zalo.me/',
            'conversation_id': 'zalo-private-ai-1',
            'conversation_title': 'Khách Zalo',
            'conversation_type': 'private',
            'is_group': False,
            'messages': [
                {
                    'message_id': 'incoming-1',
                    'sender_name': 'Khách Zalo',
                    'text': 'Mẫu này giá bao nhiêu em?',
                    'display_time': '09:00',
                },
                {
                    'message_id': 'outgoing-1',
                    'sender_is_self': True,
                    'sender_name': 'Sale A',
                    'text': 'Mẫu này giá 2 triệu anh ạ.',
                    'display_time': '09:01',
                },
                {
                    'message_id': 'incoming-2',
                    'sender_name': 'Khách Zalo',
                    'text': 'Em ơi giá này đắt quá',
                    'display_time': '09:02',
                },
            ],
        })

    def test_generate_reads_saved_context_uses_templates_and_deduplicates(self):
        classifier = Mock(
            api_key='test-key',
            provider='gemini',
            model='gemini-test',
            last_error='',
        )
        classifier.suggest_zalo_reply.return_value = {
            'intent_label': 'chê giá cao',
            'customer_need': 'Khách thấy mức giá hiện tại cao.',
            'sentiment': 'negative',
            'urgency': 'medium',
            'confidence': 0.92,
            'recommended_approach': 'Giải thích giá trị và hỏi ngân sách.',
            'suggested_replies': [{'label': 'Khuyến nghị', 'text': 'Dạ em hiểu ạ, anh dự kiến ngân sách khoảng bao nhiêu để em tư vấn mẫu phù hợp hơn?'}],
            'context_message_count': 3,
            'context_included_count': 3,
        }
        templates = [
            {'id': 'price', 'title': 'Xử lý giá', 'trigger': 'gia', 'text': 'Hỏi ngân sách và giải thích giá trị.'},
            {'id': 'phone', 'title': 'Xin số điện thoại', 'trigger': 'sdt', 'text': 'Anh để lại số điện thoại.'},
        ]

        with backend.app.test_request_context('/'):
            with (
                patch.object(backend, '_zalo_threads', self.threads),
                patch.object(backend, '_current_staff', return_value=self.staff),
                patch.object(backend, '_is_admin', return_value=False),
                patch.object(backend, 'USE_SUPABASE', False),
                patch.object(backend, '_save_zalo_threads'),
                patch.object(backend, '_get_classifier', return_value=classifier),
                patch.object(backend, '_comment_templates', templates),
                patch.object(backend, '_business_profile', {'business_name': 'F-Solution'}),
            ):
                conversation, _, _ = self._store_private_conversation()
                first, first_warning = backend._generate_zalo_ai_suggestion(conversation['conversation_key'])
                second, second_warning = backend._generate_zalo_ai_suggestion(conversation['conversation_key'])

        self.assertEqual(first_warning, '')
        self.assertEqual(second_warning, '')
        self.assertEqual(first['status'], 'ready')
        self.assertEqual(first['trigger_text'], 'Em ơi giá này đắt quá')
        self.assertEqual(second['suggestion_key'], first['suggestion_key'])
        self.assertEqual(classifier.suggest_zalo_reply.call_count, 1)
        call = classifier.suggest_zalo_reply.call_args.args
        self.assertEqual([row['text'] for row in call[1]], [
            'Mẫu này giá bao nhiêu em?',
            'Mẫu này giá 2 triệu anh ạ.',
            'Em ơi giá này đắt quá',
        ])
        self.assertEqual(call[2]['text'], 'Em ơi giá này đắt quá')
        self.assertEqual(call[3][0]['id'], 'price')

    def test_generate_saves_clear_failure_when_staff_ai_is_not_configured(self):
        classifier = Mock(api_key='', provider='gemini', model='gemini-test', last_error='')
        with backend.app.test_request_context('/'):
            with (
                patch.object(backend, '_zalo_threads', self.threads),
                patch.object(backend, '_current_staff', return_value=self.staff),
                patch.object(backend, '_is_admin', return_value=False),
                patch.object(backend, 'USE_SUPABASE', False),
                patch.object(backend, '_save_zalo_threads'),
                patch.object(backend, '_get_classifier', return_value=classifier),
            ):
                conversation, _, _ = self._store_private_conversation()
                suggestion, warning = backend._generate_zalo_ai_suggestion(conversation['conversation_key'])

        self.assertEqual(warning, '')
        self.assertEqual(suggestion['status'], 'failed')
        self.assertIn('Chưa cấu hình API key AI', suggestion['error'])
        classifier.suggest_zalo_reply.assert_not_called()

    def test_automatic_sync_generates_suggestion_after_saving_new_message(self):
        client = backend.app.test_client()
        generated = {
            'suggestion_key': 'suggestion-1',
            'conversation_key': 'conversation-1',
            'status': 'ready',
            'suggested_replies': [{'label': 'Khuyến nghị', 'text': 'Câu trả lời'}],
        }
        payload = {
            'conversation_url': 'https://chat.zalo.me/',
            'conversation_id': 'zalo-private-auto-1',
            'conversation_title': 'Khách tự động',
            'conversation_type': 'private',
            'is_group': False,
            'auto_detected': True,
            'trigger_message_id': 'incoming-auto-1',
            'messages': [{'message_id': 'incoming-auto-1', 'sender_name': 'Khách', 'text': 'Giá này đắt quá'}],
        }
        with (
            patch.object(backend, '_zalo_threads', self.threads),
            patch.object(backend, '_current_staff', return_value=self.staff),
            patch.object(backend, '_is_admin', return_value=False),
            patch.object(backend, 'USE_SUPABASE', False),
            patch.object(backend, '_save_zalo_threads'),
            patch.object(backend, '_generate_zalo_ai_suggestion', return_value=(generated, '')) as generate,
        ):
            response = client.post('/api/zalo/sync', json=payload)
            stored_message_count = len(backend._zalo_threads['messages'])

        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data['ok'])
        self.assertEqual(data['ai_suggestion']['suggestion_key'], 'suggestion-1')
        self.assertEqual(stored_message_count, 1)
        generate.assert_called_once()
        self.assertEqual(generate.call_args.kwargs['trigger_message_id'], 'incoming-auto-1')

    def test_ai_failure_never_rolls_back_automatic_message_sync(self):
        client = backend.app.test_client()
        payload = {
            'conversation_url': 'https://chat.zalo.me/',
            'conversation_id': 'zalo-private-auto-failure',
            'conversation_title': 'Khách tự động',
            'conversation_type': 'private',
            'is_group': False,
            'auto_detected': True,
            'messages': [{'message_id': 'incoming-failure-1', 'sender_name': 'Khách', 'text': 'Cần tư vấn'}],
        }
        with (
            patch.object(backend, '_zalo_threads', self.threads),
            patch.object(backend, '_current_staff', return_value=self.staff),
            patch.object(backend, '_is_admin', return_value=False),
            patch.object(backend, 'USE_SUPABASE', False),
            patch.object(backend, '_save_zalo_threads'),
            patch.object(backend, '_generate_zalo_ai_suggestion', side_effect=RuntimeError('AI timeout')),
        ):
            response = client.post('/api/zalo/sync', json=payload)
            stored_message_count = len(backend._zalo_threads['messages'])

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.get_json()['ok'])
        self.assertEqual(stored_message_count, 1)
        self.assertIn('AI timeout', response.get_json()['warning'])

    def test_classifier_prompt_contains_chronological_history_and_reply_templates(self):
        classifier = AIClassifier('gemini', 'gemini-test', 'test-key')
        response = json.dumps({
            'intent_label': 'chê giá cao',
            'customer_need': 'Khách muốn phương án phù hợp ngân sách hơn.',
            'sentiment': 'negative',
            'urgency': 'medium',
            'confidence': 0.88,
            'recommended_approach': 'Đồng cảm và hỏi ngân sách.',
            'suggested_replies': [{'label': 'Khuyến nghị', 'text': 'Dạ em hiểu, anh cho em xin khoảng ngân sách để em tư vấn đúng mẫu ạ.'}],
        }, ensure_ascii=False)
        messages = [
            {'message_key': 'm1', 'direction': 'incoming', 'sender_name': 'Khách', 'text': 'Mẫu A giá sao?', 'display_time': '09:00'},
            {'message_key': 'm2', 'direction': 'outgoing', 'sender_name': 'Sale', 'text': 'Mẫu A giá 2 triệu ạ.', 'display_time': '09:01'},
            {'message_key': 'm3', 'direction': 'incoming', 'sender_name': 'Khách', 'text': 'Giá này đắt quá', 'display_time': '09:02'},
        ]
        with patch.object(classifier, '_call_api', return_value=response) as call_api:
            result = classifier.suggest_zalo_reply(
                {'conversation_id': 'zalo-1', 'title': 'Khách'},
                messages,
                messages[-1],
                [{'title': 'Xử lý giá', 'trigger': 'gia', 'text': 'Hỏi ngân sách.'}],
                {'business_name': 'F-Solution'},
            )

        prompt = call_api.call_args.args[0]
        self.assertLess(prompt.index('Mẫu A giá sao?'), prompt.index('Mẫu A giá 2 triệu ạ.'))
        self.assertLess(prompt.index('Mẫu A giá 2 triệu ạ.'), prompt.index('Giá này đắt quá'))
        self.assertIn('Xử lý giá', prompt)
        self.assertIn('Hỏi ngân sách.', prompt)
        self.assertEqual(result['trigger_message_key'], 'm3')
        self.assertEqual(result['context_included_count'], 3)
        self.assertEqual(result['suggested_replies'][0]['label'], 'Khuyến nghị')


if __name__ == '__main__':
    unittest.main()
