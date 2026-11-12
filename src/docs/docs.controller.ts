import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '@/common/auth/auth.decorators';
import { DocsService } from './docs.service';

@Public()
@Controller('docs')
export class DocsController {
  constructor(private readonly docs: DocsService) {}

  @Get()
  @Header('Content-Type', 'application/yaml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  yaml(): string {
    return this.docs.yaml();
  }

  @Get('openapi.json')
  @Header('Cache-Control', 'public, max-age=300')
  json(): unknown {
    return this.docs.json();
  }
}
