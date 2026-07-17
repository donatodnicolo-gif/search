import { PartialType } from '@nestjs/swagger';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';
import { DeliveryStatus } from '../../common/enums';
import { CreateDeliveryDto } from './create-delivery.dto';

export class UpdateDeliveryDto extends PartialType(CreateDeliveryDto) {}

export class UpdateDeliveryStatusDto {
  @ApiProperty({ enum: DeliveryStatus })
  @IsEnum(DeliveryStatus)
  status: DeliveryStatus;
}

export class AssignValetDto {
  // Senza decoratore di validazione il ValidationPipe (whitelist) scartava
  // il campo e il service riceveva undefined.
  @ApiProperty()
  @IsString()
  valetId: string;
}
