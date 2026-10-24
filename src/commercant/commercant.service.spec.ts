import { Test, TestingModule } from '@nestjs/testing';
import { CommercantService } from './commercant.service';

describe('CommercantService', () => {
  let service: CommercantService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CommercantService],
    }).compile();

    service = module.get<CommercantService>(CommercantService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
