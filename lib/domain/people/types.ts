export type PeopleTreeNodeKind = "peopleGroup" | "person" | "content";

export interface PeopleTreeContentNode {
  treeNodeKind: "content";
  id: string;
  contentId: string;
  title: string;
  contentType: string;
  customIcon: string | null;
  iconColor: string | null;
  fileMimeType: string | null;
  parentId: string | null;
  peopleGroupId: string | null;
  personId: string | null;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
  children: PeopleTreeContentNode[];
}

export interface PeopleFileTreeMountSummary {
  id: string;
  contentParentId: string | null;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PeopleTreePersonNode {
  treeNodeKind: "person";
  id: string;
  personId: string;
  primaryGroupId: string;
  displayName: string;
  slug: string;
  givenName: string | null;
  familyName: string | null;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
  mount: PeopleFileTreeMountSummary | null;
  contentCount: number;
  content: PeopleTreeContentNode[];
}

export interface PeopleTreeGroupNode {
  treeNodeKind: "peopleGroup";
  id: string;
  groupId: string;
  parentGroupId: string | null;
  name: string;
  slug: string;
  description: string | null;
  displayOrder: number;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  mount: PeopleFileTreeMountSummary | null;
  contentCount: number;
  content: PeopleTreeContentNode[];
  people: PeopleTreePersonNode[];
  childGroups: PeopleTreeGroupNode[];
}

export interface PeopleTreeResponse {
  defaultGroup: PeopleTreeGroupNode;
  groups: PeopleTreeGroupNode[];
  stats: {
    groups: number;
    people: number;
    mountedGroups: number;
    mountedPeople: number;
  };
}

export type PeopleSearchResult =
  | {
      treeNodeKind: "peopleGroup";
      id: string;
      groupId: string;
      parentGroupId: string | null;
      label: string;
      slug: string;
      isDefault: boolean;
      mount: PeopleFileTreeMountSummary | null;
    }
  | {
      treeNodeKind: "person";
      id: string;
      personId: string;
      primaryGroupId: string;
      label: string;
      slug: string;
      email: string | null;
      phone: string | null;
      avatarUrl: string | null;
      mount: PeopleFileTreeMountSummary | null;
    };
