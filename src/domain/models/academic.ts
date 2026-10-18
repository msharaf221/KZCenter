import type { AttendanceStatus } from './common';

export interface Attendance {
  id: string;
  studentId: string;
  groupId: string;
  date: string;
  status: AttendanceStatus;
  checkInTime?: string;
  checkOutTime?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Exam {
  id: string;
  name: string;
  groupId: string;
  date: string;
  maxGrade: number;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

export interface Grade {
  id: string;
  examId: string;
  studentId: string;
  grade: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
