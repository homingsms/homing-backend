import { Injectable, Logger, type OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { AppConfig } from '@/config/app-config.service';

@Injectable()
export class DocsService implements OnModuleInit {
  private readonly logger = new Logger(DocsService.name);
  private yamlSpec: string | null = null;
  private jsonSpec: unknown = null;

  constructor(private readonly config: AppConfig) {}

  async onModuleInit(): Promise<void> {
    const path = resolve(process.cwd(), this.config.get('OPENAPI_SPEC_PATH'));
    try {
      this.yamlSpec = await readFile(path, 'utf8');
      this.jsonSpec = parse(this.yamlSpec) as unknown;
    } catch (error) {
      this.logger.warn(`API spec not available at ${path}: ${String(error)}`);
    }
  }

  yaml(): string {
    if (this.yamlSpec === null) {
      throw new ServiceUnavailableException('API spec is not available');
    }
    return this.yamlSpec;
  }

  json(): unknown {
    if (this.jsonSpec === null) {
      throw new ServiceUnavailableException('API spec is not available');
    }
    return this.jsonSpec;
  }
}
