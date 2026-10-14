import { ContactRequesterType } from '../common/enums';
import { contactRequests } from '../database/schema';
import { ContactRequestsService } from './contact-requests.service';

describe('ContactRequestsService public intake', () => {
  it('normalizes contact fields and stores privacy consent without returning PII', async () => {
    const createdAt = new Date('2026-08-29T12:00:00.000Z');
    const created = {
      id: '00000000-0000-4000-8000-000000000201',
      status: 'NEW',
      createdAt,
    };
    const values = jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue([created]),
    });
    const insert = jest.fn().mockReturnValue({ values });
    const service = new ContactRequestsService({ db: { insert } } as never);

    await expect(service.create({
      requesterType: ContactRequesterType.CONTRACTOR,
      name: ' Ana Pérez ',
      email: ' ANA@EXAMPLE.COM ',
      phone: ' +57 300 123 4567 ',
      organization: ' Example Org ',
      message: ' I would like to learn more. ',
      privacyAccepted: true,
    } as never)).resolves.toEqual(created);

    expect(insert).toHaveBeenCalledWith(contactRequests);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      requesterType: ContactRequesterType.CONTRACTOR,
      name: 'Ana Pérez',
      email: 'ana@example.com',
      phone: '+57 300 123 4567',
      organization: 'Example Org',
      message: 'I would like to learn more.',
      privacyAcceptedAt: expect.any(Date),
    }));
    expect(Object.keys(created).sort()).toEqual(['createdAt', 'id', 'status']);
  });
});
