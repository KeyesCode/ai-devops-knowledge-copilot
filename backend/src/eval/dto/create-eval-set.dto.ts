import { IsString, IsOptional, IsArray, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateEvalQuestionDto {
  @IsString()
  question: string;

  @IsString()
  expectedAnswer: string;

  @IsOptional()
  metadata?: Record<string, any>;
}

export class CreateEvalSetDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  scopedSources?: string[];

  @IsOptional()
  metadata?: Record<string, any>;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEvalQuestionDto)
  questions?: CreateEvalQuestionDto[];
}

