import { Module } from '@nestjs/common';
import { DevicesModule } from '@/devices/devices.module';
import { DispatcherService } from './dispatcher.service';
import { MessageReaderService } from './message-reader.service';
import { MessagesController } from './messages.controller';
import { MessagesService } from './messages.service';

@Module({
  imports: [DevicesModule],
  controllers: [MessagesController],
  providers: [MessagesService, MessageReaderService, DispatcherService],
  exports: [DispatcherService],
})
export class MessagesModule {}
