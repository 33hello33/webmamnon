export const isDeletedParentRecord = (record) => {
  const deletedValue = String(record?.daxoa || '').trim().toLowerCase();
  return deletedValue === 'đã xóa' || deletedValue === 'da xoa';
};

export const enrichParentChildren = async (supabase, studentRecords = []) => {
  const children = (studentRecords || []).filter((student) => student?.mahv);
  if (children.length === 0) return [];

  const classIds = [...new Set(children.map((student) => student?.malop).filter(Boolean))];
  const classNameMap = new Map();

  if (classIds.length > 0) {
    const { data: classRows } = await supabase
      .from('tbl_lop')
      .select('malop, tenlop')
      .in('malop', classIds);

    (classRows || []).forEach((row) => {
      if (row?.malop) {
        classNameMap.set(row.malop, row.tenlop || row.malop);
      }
    });
  }

  return children.map((student) => ({
    ...student,
    tenlop: classNameMap.get(student.malop) || student.tenlop || student.malop || null
  }));
};

export const fetchParentStudentPortalData = async (supabase, studentRecord) => {
  const mahv = studentRecord?.mahv;
  if (!mahv) {
    throw new Error('Missing student id');
  }

  const [{ data: feeRows }, { data: invoiceRows }, { data: attendances }] = await Promise.all([
    supabase
      .from('tbl_thongbao')
      .select('*')
      .eq('mahv', mahv)
      .order('ngaylap', { ascending: false })
      .limit(20),
    supabase
      .from('tbl_hd')
      .select('*')
      .eq('mahv', mahv)
      .order('ngaylap', { ascending: false })
      .limit(20),
    supabase
      .from('tbl_diemdanh')
      .select('*')
      .eq('mahv', mahv)
      .order('ngay', { ascending: false })
      .limit(30)
  ]);

  const latestFee = (feeRows || []).find((row) => !isDeletedParentRecord(row)) || null;
  const invoices = (invoiceRows || []).filter((row) => !isDeletedParentRecord(row));

  let teacherManv = null;
  let tenLop = studentRecord?.tenlop || null;
  const { data: classData } = await supabase
    .from('tbl_lop')
    .select('manv, tenlop')
    .eq('malop', studentRecord?.malop)
    .maybeSingle();

  if (classData) {
    teacherManv = classData.manv || null;
    tenLop = classData.tenlop || tenLop;
  } else {
    const { data: firstStaff } = await supabase.from('tbl_nv').select('manv').limit(1).maybeSingle();
    teacherManv = firstStaff?.manv || null;
  }

  let teacherInfo = null;
  if (teacherManv) {
    const { data: staffData } = await supabase
      .from('tbl_nv')
      .select('tennv, role, sdt')
      .eq('manv', teacherManv)
      .maybeSingle();
    teacherInfo = staffData || null;
  }

  return {
    student: {
      ...studentRecord,
      tenlop: tenLop
    },
    latestFee,
    invoices,
    attendances: attendances || [],
    teacherManv,
    teacherInfo
  };
};
