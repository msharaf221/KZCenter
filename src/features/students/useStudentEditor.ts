import { useState } from 'react';
import type { Student } from '../../domain/models';

const INITIAL_FORM: Omit<Student, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  age: 10,
  gender: 'male',
  phone: '',
  parentPhone: '',
  avatar: '',
  notes: '',
  status: 'active',
  totalPaid: 0,
  enrolledGroups: [],
  school: '',
  gradeLevel: '',
  source: '',
  parentName: '',
};

interface EnrollPricing {
  priceOverride?: number;
  discountAmount?: number;
  discountPercent?: number;
  discountReason?: string;
}

export function useStudentEditor() {
  const [showModal, setShowModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [form, setForm] = useState<Omit<Student, 'id' | 'createdAt' | 'updatedAt'>>(INITIAL_FORM);
  const [initialPayments, setInitialPayments] = useState<Record<string, number>>({});
  const [startSessions, setStartSessions] = useState<Record<string, number>>({});
  const [enrollPricing, setEnrollPricing] = useState<Record<string, EnrollPricing>>({});

  function openAdd() {
    setEditingStudent(null);
    setForm(INITIAL_FORM);
    setInitialPayments({});
    setStartSessions({});
    setEnrollPricing({});
    setShowModal(true);
  }

  function openEdit(student: Student) {
    setEditingStudent(student);
    setInitialPayments({});
    setStartSessions({});
    setEnrollPricing({});
    setForm({
      name: student.name,
      age: student.age,
      gender: student.gender,
      phone: student.phone || '',
      parentPhone: student.parentPhone,
      avatar: student.avatar || '',
      notes: student.notes || '',
      status: student.status,
      totalPaid: student.totalPaid,
      enrolledGroups: [...(student.enrolledGroups || [])],
      school: student.school || '', gradeLevel: student.gradeLevel || '', source: student.source || '', parentName: student.parentName || '',
    });
    setShowModal(true);
  }

  return {
    showModal,
    setShowModal,
    editingStudent,
    setEditingStudent,
    form,
    setForm,
    initialPayments,
    setInitialPayments,
    startSessions,
    setStartSessions,
    enrollPricing,
    setEnrollPricing,
    openAdd,
    openEdit,
  };
}

export type StudentEditor = ReturnType<typeof useStudentEditor>;
