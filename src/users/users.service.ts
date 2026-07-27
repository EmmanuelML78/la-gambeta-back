import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { DrizzleService } from '../database/drizzle.service';
import { User, users } from '../database/schema';
import { UserRole } from '../common/enums';

export interface CreateUserData {
  email: string;
  firstName: string;
  lastName: string;
  role?: UserRole;
  emailVerified?: boolean;
}

export interface UpdateUserData {
  firstName?: string;
  lastName?: string;
  emailVerified?: boolean;
  role?: UserRole;
  isActive?: boolean;
}

@Injectable()
export class UsersService {
  constructor(private readonly drizzle: DrizzleService) {}

  async create(data: CreateUserData): Promise<User> {
    const existingUser = await this.findByEmail(data.email);
    if (existingUser) {
      throw new ConflictException('El email ya está registrado');
    }

    const userData = {
      id: uuidv4(),
      name: `${data.firstName} ${data.lastName}`,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role || UserRole.USER,
      emailVerified: data.emailVerified || false,
      isActive: true,
    };

    const [newUser] = await this.drizzle.db
      .insert(users)
      .values(userData)
      .returning();
    if (!newUser) {
      throw new Error('Failed to create user');
    }
    return newUser;
  }

  async findById(id: string): Promise<User | null> {
    const [user] = await this.drizzle.db
      .select()
      .from(users)
      .where(eq(users.id, id));
    return user || null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const [user] = await this.drizzle.db
      .select()
      .from(users)
      .where(eq(users.email, email));
    return user || null;
  }

  async update(id: string, data: UpdateUserData): Promise<User> {
    const updateData: {
      firstName?: string;
      lastName?: string;
      emailVerified?: boolean;
      role?: UserRole;
      isActive?: boolean;
      name?: string;
      updatedAt: Date;
    } = {
      ...data,
      updatedAt: new Date(),
    };

    // Si se actualizan firstName o lastName, actualizar también name
    if (data.firstName || data.lastName) {
      const user = await this.findById(id);
      if (user) {
        updateData.name = `${data.firstName || user.firstName} ${data.lastName || user.lastName}`;
      }
    }

    const [updatedUser] = await this.drizzle.db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();

    if (!updatedUser) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return updatedUser;
  }

  async updateRole(userId: string, role: UserRole): Promise<void> {
    await this.update(userId, { role });
  }

  async deactivate(userId: string): Promise<void> {
    await this.update(userId, { isActive: false });
  }

  async activate(userId: string): Promise<void> {
    await this.update(userId, { isActive: true });
  }
}
