import { Test, TestingModule } from '@nestjs/testing';
import { CommercantController } from './commercant.controller';
import { CommercantService } from './commercant.service';

describe('CommercantController', () => {
  let controller: CommercantController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommercantController],
      providers: [CommercantService],
    }).compile();

    controller = module.get<CommercantController>(CommercantController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
