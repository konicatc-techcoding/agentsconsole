export interface Provider {
  id: string;
  display_name: string;
  command: string;
  installed: boolean;
  path: string | null;
  version: string | null;
  error: string | null;
}
