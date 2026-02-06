export interface ImageData {
  id: string;
  url: string;
  source: 'album' | 'example' | 'camera';
  timestamp: number;
}

export interface AnalysisResult {
  summary: string;
  details: string;
  tags: string[];
  confidence: number;
}

export interface GenerationResult {
  id: string;
  originalImage: ImageData;
  generatedUrl?: string;
  analysis?: AnalysisResult;
  prompt?: string;
  timestamp: number;

  // RunningHub / 渲染记录增强
  status?: 'rendering' | 'completed' | 'failed';
  taskId?: string;
  startedAt?: number;
  endedAt?: number;
  elapsedMs?: number;
  inputPreviews?: string[];
  errorMessage?: string;
}

export type GenerationStatus = 
  | 'idle'
  | 'analyzing'
  | 'analysis-failed'
  | 'ready'
  | 'generating'
  | 'generation-failed'
  | 'completed';

export interface GenerationError {
  type: 'network' | 'format' | 'compliance' | 'service-busy' | 'permission';
  message: string;
  action: string;
}
