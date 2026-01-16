
export interface NoteData {
  value: string; // "1", "2", etc.
  frequency: number;
  duration: number; // in seconds
}

export interface PlacedNote extends NoteData {
  id: string;
  x: number;
  y: number;
}

export interface Melody {
  notes: NoteData[];
}
