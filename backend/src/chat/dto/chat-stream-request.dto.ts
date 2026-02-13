import {
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  Min,
  Max,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ConversationHistoryItem {
  @IsString()
  role: 'user' | 'assistant';

  @IsString()
  content: string;
}

export class ChatStreamRequestDto {
  @IsString()
  query: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  topK?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConversationHistoryItem)
  conversationHistory?: ConversationHistoryItem[];
}

