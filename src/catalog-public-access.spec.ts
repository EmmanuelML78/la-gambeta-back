import 'reflect-metadata';
import { IS_PUBLIC_KEY } from './auth/decorators/public.decorator';
import { CourtsController } from './courts/courts.controller';
import { VenuesController } from './venues/venues.controller';

describe('public catalog access', () => {
  it.each([
    ['CourtsController.findAll', CourtsController.prototype, 'findAll'],
    ['CourtsController.findOne', CourtsController.prototype, 'findOne'],
    ['VenuesController.findAll', VenuesController.prototype, 'findAll'],
    ['VenuesController.findOne', VenuesController.prototype, 'findOne'],
  ])('marks %s as public', (_label, prototype, method) => {
    const handler = Reflect.get(prototype, method) as object;
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
  });
});
