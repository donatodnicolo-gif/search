import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { JwtUser } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user || !user.active) {
      throw new UnauthorizedException('Credenziali non valide');
    }
    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('Credenziali non valide');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      isSupport: user.isSupport,
      partnerId: user.partnerId,
      valetId: user.valetId,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isSupport: user.isSupport,
        partnerId: user.partnerId,
        valetId: user.valetId,
      },
    };
  }

  async me(jwtUser: JwtUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: jwtUser.sub },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isSupport: true,
        partnerId: true,
        valetId: true,
        active: true,
      },
    });
    return user;
  }
}
