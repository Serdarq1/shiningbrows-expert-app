import unittest
from unittest.mock import patch, MagicMock
import app as module

class ReliabilityTests(unittest.TestCase):
    def setUp(self):
        module.app.config.update(TESTING=True, SECRET_KEY='test-only')
        self.client = module.app.test_client()
        module._storage_urls.clear()

    def test_existing_session_opens_dashboard(self):
        with self.client.session_transaction() as session:
            session['student_id'] = 123
        self.assertEqual(self.client.get('/login').location, '/dashboard')
        self.assertEqual(self.client.get('/dashboard').status_code, 200)

    def test_guest_can_still_sign_in(self):
        with self.client.session_transaction() as session:
            session['guest'] = True
        self.assertEqual(self.client.get('/login').status_code, 200)

    def test_missing_student_clears_stale_session(self):
        with self.client.session_transaction() as session:
            session['student_id'] = 123
        with patch.object(module, 'fetch_table', return_value=[]):
            self.assertEqual(self.client.get('/api/student').status_code, 401)
        self.assertEqual(self.client.get('/login').status_code, 200)

    def test_unauthenticated_dashboard_requires_login(self):
        self.assertEqual(self.client.get('/dashboard').location, '/login')

    def test_identity_outage_does_not_destroy_session(self):
        with self.client.session_transaction() as session:
            session['student_id'] = 123
        with patch.object(module, '_verify_clerk_token', return_value={'sub': 'user_1'}), patch.object(module, '_fetch_clerk_user', return_value=None):
            self.assertEqual(self.client.post('/api/clerk/authorize', json={'token': 'test'}).status_code, 503)
        with self.client.session_transaction() as session:
            self.assertEqual(session['student_id'], 123)

    def test_database_outage_is_not_unauthorized(self):
        with self.client.session_transaction() as session:
            session['student_id'] = 123
        with patch.object(module, 'fetch_table', side_effect=ConnectionError):
            self.assertEqual(self.client.get('/api/student').status_code, 503)

    def test_successful_auth_persists_cookie(self):
        with patch.object(module, '_verify_clerk_token', return_value={'sub': 'user_1'}), patch.object(module, '_fetch_clerk_user', return_value={}), patch.object(module, '_clerk_user_email_and_name', return_value={'email': 'test@example.com', 'full_name': 'Test'}):
            # A missing upstream identity is never accepted.
            self.assertEqual(self.client.post('/api/clerk/authorize', json={'token':'test'}).status_code, 503)
        with patch.object(module, '_verify_clerk_token', return_value={'sub': 'user_1'}), patch.object(module, '_fetch_clerk_user', return_value={'id':'user_1'}), patch.object(module, '_clerk_user_email_and_name', return_value={'email': 'test@example.com', 'full_name': 'Test'}), patch.object(module, 'fetch_table', return_value=[{'id':123}]):
            result = self.client.post('/api/clerk/authorize', json={'token':'test'})
            self.assertEqual(result.status_code, 200)
            self.assertIn('Expires=', result.headers['Set-Cookie'])

    def test_signed_urls_reused_and_refreshed(self):
        storage = MagicMock()
        storage.storage.from_.return_value.create_signed_url.return_value = {'signedURL': 'https://example.com/image?token=1'}
        with patch.object(module, 'supabase', storage), patch.object(module.time, 'monotonic', return_value=0):
            first = module.build_storage_url('photo.jpg', 'private')
            self.assertEqual(first, module.build_storage_url('photo.jpg', 'private'))
            self.assertEqual(storage.storage.from_.return_value.create_signed_url.call_count, 1)
        with patch.object(module, 'supabase', storage), patch.object(module.time, 'monotonic', return_value=3601):
            module.build_storage_url('photo.jpg', 'private')
            self.assertEqual(storage.storage.from_.return_value.create_signed_url.call_count, 2)

if __name__ == '__main__':
    unittest.main()
