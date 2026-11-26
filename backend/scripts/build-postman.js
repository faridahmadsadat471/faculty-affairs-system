import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

function request(name, method, path, body, tests = [], pre = []) {
  return {
    name,
    event: [
      ...(pre.length ? [{ listen: 'prerequest', script: { type: 'text/javascript', exec: pre } }] : []),
      { listen: 'test', script: { type: 'text/javascript', exec: tests } },
    ],
    request: {
      method,
      auth: ['/api/auth/login', '/api/health'].includes(path) ? { type: 'noauth' } : { type: 'bearer', bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }] },
      header: body ? [{ key: 'Content-Type', value: 'application/json' }] : [],
      url: '{{baseUrl}}' + path,
      ...(body ? { body: { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } } } : {}),
    },
  };
}
const expect = (status) => `pm.test('HTTP ${status}', function () { pm.response.to.have.status(${status}); });`;
const collection = {
  info: { _postman_id: '541cb988-5a40-4c54-88ab-6b2f6df9b9eb', name: 'Faculty Affairs Backend Verification', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json', description: 'Start npm run postman:server on port 5001, then run this entire collection in order. It creates isolated fixtures and tests archive, search, promotions, contracts, research, awards, reports, private PDF documents and security. Test accounts are created only in the temporary database. Every module logs in automatically. Never point this collection at the real project database.' },
  variable: [{ key: 'baseUrl', value: 'http://127.0.0.1:5001' }, { key: 'accessToken', value: '' }, { key: 'facultyId', value: '' }],
  item: [
    request('01 Login test administrator', 'POST', '/api/auth/login', { email: 'postman-admin@example.test', password: 'IntegrationFixture123!' }, [expect(200), 'if (pm.response.code === 200) pm.collectionVariables.set("accessToken", pm.response.json().accessToken);']),
    request('02 Create faculty fixture', 'POST', '/api/faculty', { employeeId: '{{employeeId}}', fullName: 'Isolated Postman Faculty', department: 'Computer Science', academicRank: 'lecturer' }, [expect(201), 'if (pm.response.code === 201) pm.collectionVariables.set("facultyId", pm.response.json().faculty._id);'], ['pm.variables.set("employeeId", "TEST-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8));']),
    request('03 Archive faculty fixture', 'DELETE', '/api/faculty/{{facultyId}}', null, [expect(200), 'pm.test("Archived", function () { pm.expect(pm.response.json().message).to.eql("Faculty archived successfully"); });']),
    request('04 Archived faculty is hidden', 'GET', '/api/faculty/{{facultyId}}', null, [expect(404)]),
    ...[
      ['05 Faculty search and filters', 'faculty-search'], ['06 Promotion review workflow', 'promotions'],
      ['07 Contract approval and renewal', 'contracts'], ['08 Research publication', 'research'],
      ['09 Awards and achievements', 'awards'], ['10 Scoped reports and CSV', 'reports'],
      ['11 Private PDF documents', 'documents'], ['12 Permissions and session security', 'security'],
      ['13 Account management passwords and audit', 'user-management'],
    ].map(([name, file]) => request(name, 'GET', '/api/health', null, readFileSync(new URL(`../postman/suites/${file}.js`, import.meta.url), 'utf8').trimEnd().split(/\r?\n/))),
  ],
};
mkdirSync(new URL('../postman/', import.meta.url), { recursive: true });
writeFileSync(new URL('../postman/faculty-affairs.postman_collection.json', import.meta.url), JSON.stringify(collection, null, 2) + '\n');
