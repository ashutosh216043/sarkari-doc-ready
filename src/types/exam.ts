export type DocumentType = 'photo' | 'signature' | 'thumb' | 'declaration' | 'custom';

export type DimensionUnit = 'px' | 'cm';

export interface DocumentSpec {
  id: string;
  type: DocumentType;
  label: string;
  shortLabel: string;
  widthPx: number;
  heightPx: number;
  physicalLabel?: string;
  minKB: number;
  maxKB: number;
  format: 'JPG';
  dpiLabel?: string;
  rules: string[];
  allowStamp?: boolean;
  defaultStampEnabled?: boolean;
  allowEnhance?: boolean;
  defaultEnhanceEnabled?: boolean;
  allowBgRemove?: boolean;
  /** Optional square range for UPSC-style presets */
  scalableRangePx?: {
    min: number;
    max: number;
    step: number;
  };
}

export interface ExamPreset {
  id: string;
  name: string;
  shortName: string;
  category: string;
  description: string;
  isCustom?: boolean;
  documents: DocumentSpec[];
}

export interface CropState {
  zoom: number;
  panX: number;
  panY: number;
  rotation: 0 | 90 | 180 | 270;
}

export interface StampSettings {
  enabled: boolean;
  candidateName: string;
  dateOfPhoto: string;
}

export interface EnhanceSettings {
  enabled: boolean;
  threshold: number;
}

export interface PhotoBgRemoveSettings {
  enabled: boolean;
  bgColor: string;
  edgeFeather: number;
}

export interface ProcessedResult {
  blob: Blob;
  objectUrl: string;
  widthPx: number;
  heightPx: number;
  sizeBytes: number;
  sizeKB: number;
  qualityUsed: number;
  isValid: boolean;
  statusMessage: string;
  fileName: string;
}

export interface DocumentWorkItem {
  spec: DocumentSpec;
  sourceFile: File | null;
  sourceUrl: string | null;
  sourceWidth: number;
  sourceHeight: number;
  crop: CropState;
  stamp: StampSettings;
  enhance: EnhanceSettings;
  bgRemove: PhotoBgRemoveSettings;
  processed: ProcessedResult | null;
  isProcessing: boolean;
  error: string | null;
}
