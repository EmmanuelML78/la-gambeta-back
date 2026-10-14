import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BookingStatus, UserRole } from '../common/enums';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

describe('GET /bookings/admin HTTP contract', () => {
  let app: INestApplication;
  const pagedResult = {
    items: [
      {
        id: 'booking-1',
        bookingDate: '2026-10-13T00:00:00.000Z',
        startTime: '18:00',
        endTime: '19:00',
        status: BookingStatus.PENDING,
        totalPrice: '50000.00',
        user: { id: 'user-1', name: 'Ana Perez' },
        court: { id: 'court-1', name: 'Cancha Norte' },
      },
    ],
    total: 41,
    page: 1,
    limit: 20,
    totalPages: 3,
  };
  const findAllAdminPaginated = jest.fn().mockResolvedValue(pagedResult);
  const legacyRows = [{ id: 'legacy-booking', notes: 'legacy detail' }];
  const findAll = jest.fn().mockResolvedValue(legacyRows);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [
        {
          provide: BookingsService,
          useValue: { findAllAdminPaginated, findAll },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalGuards(new RolesGuard(new Reflector()));
    // Simulate authenticated identity middleware; authorization uses the real RolesGuard.
    app.use(
      (
        req: {
          user?: { id: string; role: UserRole };
          headers: Record<string, string>;
        },
        _res: unknown,
        next: () => void,
      ) => {
        const role = req.headers['x-test-role'] as UserRole | undefined;
        if (role) req.user = { id: 'test-user', role };
        next();
      },
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    findAllAdminPaginated.mockClear();
    findAllAdminPaginated.mockResolvedValue(pagedResult);
    findAll.mockClear();
    findAll.mockResolvedValue(legacyRows);
  });

  it('dispatches the static route for ADMIN and returns only page metadata and the safe list shape', async () => {
    const response = await request(app.getHttpServer())
      .get('/bookings/admin')
      .set('x-test-role', UserRole.ADMIN)
      .expect(200);

    expect(response.body).toEqual(pagedResult);
    expect(response.body.items[0]).not.toHaveProperty('notes');
    expect(response.body.items[0].user).not.toHaveProperty('email');
    expect(response.body.items[0].court).not.toHaveProperty('description');
    expect(findAllAdminPaginated).toHaveBeenCalledWith({ page: 1, limit: 20 });
  });

  it('applies query transformation, accepts bounds, and rejects invalid bounds or status', async () => {
    await request(app.getHttpServer())
      .get(
        `/bookings/admin?page=10000&limit=100&status=${BookingStatus.PENDING}`,
      )
      .set('x-test-role', UserRole.ADMIN)
      .expect(200);
    expect(findAllAdminPaginated).toHaveBeenCalledWith({
      page: 10000,
      limit: 100,
      status: BookingStatus.PENDING,
    });

    await request(app.getHttpServer())
      .get('/bookings/admin?page=0')
      .set('x-test-role', UserRole.ADMIN)
      .expect(400);
    await request(app.getHttpServer())
      .get('/bookings/admin?limit=101')
      .set('x-test-role', UserRole.ADMIN)
      .expect(400);
    await request(app.getHttpServer())
      .get('/bookings/admin?status=NOT_A_STATUS')
      .set('x-test-role', UserRole.ADMIN)
      .expect(400);
  });

  it('denies unauthenticated and non-admin identities through the actual RolesGuard', async () => {
    await request(app.getHttpServer()).get('/bookings/admin').expect(403);
    await request(app.getHttpServer())
      .get('/bookings/admin')
      .set('x-test-role', UserRole.USER)
      .expect(403);
    expect(findAllAdminPaginated).not.toHaveBeenCalled();
  });

  it('preserves the legacy admin all-bookings array and status filter', async () => {
    const response = await request(app.getHttpServer())
      .get(`/bookings/admin/all?status=${BookingStatus.CONFIRMED}`)
      .set('x-test-role', UserRole.ADMIN)
      .expect(200);

    expect(response.body).toEqual(legacyRows);
    expect(findAll).toHaveBeenCalledWith(undefined, BookingStatus.CONFIRMED);
  });
});
