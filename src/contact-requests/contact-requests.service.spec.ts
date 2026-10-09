import { ContactRequesterType, ContactRequestStatus } from '../common/enums';
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

describe('ContactRequestsService administration', () => {
  it('returns a paginated page and total for admin filtering', async () => {
    const createdAt = new Date('2026-08-29T12:00:00.000Z');
    const row = {
      id: '00000000-0000-4000-8000-000000000201',
      requesterType: ContactRequesterType.CONTRACTOR,
      name: 'Ana Pérez',
      email: 'ana@example.com',
      phone: null,
      organization: 'Example Org',
      message: 'Request details.',
      status: ContactRequestStatus.NEW,
      privacyAcceptedAt: createdAt,
      createdAt,
      updatedAt: createdAt,
    };
    const offset = jest.fn().mockResolvedValue([row]);
    const limit = jest.fn().mockReturnValue({ offset });
    const orderBy = jest.fn().mockReturnValue({ limit });
    const dataWhere = jest.fn().mockReturnValue({ orderBy });
    const countWhere = jest.fn().mockResolvedValue([{ total: 121 }]);
    const select = jest
      .fn()
      .mockReturnValueOnce({ from: () => ({ where: dataWhere }) })
      .mockReturnValueOnce({ from: () => ({ where: countWhere }) });
    const service = new ContactRequestsService({ db: { select } } as never);

    await expect(service.findAll({ limit: 20, offset: 100 } as never)).resolves.toEqual({
      items: [row],
      total: 121,
      limit: 20,
      offset: 100,
    });
    expect(limit).toHaveBeenCalledWith(20);
    expect(offset).toHaveBeenCalledWith(100);
  });

  it('returns a contact request by id and applies a validated status transition', async () => {
    const createdAt = new Date('2026-08-29T12:00:00.000Z');
    const row = {
      id: '00000000-0000-4000-8000-000000000201',
      requesterType: ContactRequesterType.PLAYER,
      name: 'Ana Pérez',
      email: 'ana@example.com',
      phone: null,
      organization: null,
      message: 'Request details.',
      status: ContactRequestStatus.NEW,
      privacyAcceptedAt: createdAt,
      createdAt,
      updatedAt: createdAt,
    };
    const limit = jest.fn().mockResolvedValue([row]);
    const where = jest.fn().mockReturnValue({ limit });
    const select = jest.fn().mockReturnValue({ from: () => ({ where }) });
    const updatedRow = { ...row, status: ContactRequestStatus.IN_PROGRESS };
    const returning = jest.fn().mockResolvedValue([updatedRow]);
    const updateWhere = jest.fn().mockReturnValue({ returning });
    const set = jest.fn().mockReturnValue({ where: updateWhere });
    const update = jest.fn().mockReturnValue({ set });
    const service = new ContactRequestsService({ db: { select, update } } as never);

    await expect(service.findOne(row.id)).resolves.toMatchObject({
      id: row.id,
      email: row.email,
      status: ContactRequestStatus.NEW,
    });
    await expect(service.updateStatus(row.id, ContactRequestStatus.IN_PROGRESS)).resolves.toMatchObject({
      id: row.id,
      status: ContactRequestStatus.IN_PROGRESS,
    });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ status: ContactRequestStatus.IN_PROGRESS }));
  });
});
