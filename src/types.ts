export type StructureType = "kishotenketsu" | "three-act";

export interface Novel {
  id: string;
  title: string;
  text: string;
  totalPages: number;
  structureType: StructureType;
  createdAt: number;
  updatedAt: number;
}

export interface NovelsState {
  novels: Novel[];
  activeId: string;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: number;
}
