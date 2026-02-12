import { IsString, IsOptional, IsArray, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateEvalQuestionDto } from './create-eval-set.dto';

export class UpdateEvalSetDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  scopedSources?: string[];

  @IsOptional()
  metadata?: Record<string, any>;
}

export class UpdateEvalQuestionDto {
  @IsOptional()
  @IsString()
  question?: string;

  @IsOptional()
  @IsString()
  expectedAnswer?: string;

  @IsOptional()
  metadata?: Record<string, any>;
}

