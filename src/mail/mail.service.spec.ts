import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

interface SentMail {
  from?: string;
  to?: string;
  subject?: string;
  html?: string;
  template?: string;
}

describe('MailService', () => {
  it('renders the welcome template before sending it through SMTP', async () => {
    const sendMail = jest.fn<Promise<{ messageId: string }>, [SentMail]>();
    sendMail.mockResolvedValue({ messageId: 'message-1' });
    const transporter = {
      sendMail,
    };
    const configService = {
      get: jest.fn((key: string) =>
        key === 'MAIL_FROM' ? 'La Gambeta <noreply@example.com>' : undefined,
      ),
    };
    const service = new MailService(
      transporter as never,
      configService as unknown as ConfigService,
    );

    await service.sendWelcomeEmail('ana@example.com', {
      firstName: 'Ana',
      lastName: 'García',
      loginUrl: 'https://example.com/login',
    });

    const sentMail = sendMail.mock.calls[0]?.[0];
    expect(sentMail?.from).toBe('La Gambeta <noreply@example.com>');
    expect(sentMail?.to).toBe('ana@example.com');
    expect(sentMail?.subject).toContain('La Gambeta');
    expect(sentMail?.html).toContain('Ana');
    expect(sentMail).not.toHaveProperty('template');
  });
});
