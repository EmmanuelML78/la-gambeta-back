jest.mock('./app.module', () => ({ AppModule: class {} }));

import { getCorsOptions } from './main';

describe('CORS options', () => {
  it('allows idempotent reservation preflight requests from the configured frontend', () => {
    const options = getCorsOptions('https://front.example.test');

    expect(options.origin).toContain('https://front.example.test');
    expect(options.methods).toContain('OPTIONS');
    expect(options.allowedHeaders).toEqual(
      expect.arrayContaining(['Content-Type', 'Authorization', 'Idempotency-Key']),
    );
  });
});
