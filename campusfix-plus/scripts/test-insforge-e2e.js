import { createClient } from '@insforge/sdk';
import fs from 'fs';
import path from 'path';

const projectConfig = JSON.parse(
  fs.readFileSync(path.resolve('../.insforge/project.json'), 'utf8')
);

const insforge = createClient({
  baseUrl: projectConfig.oss_host,
  anonKey: 'anon_bdcdf3182a2bf594f8d960816996f680539c5963047f59e0047bf71b20c1bbab',
});

let testPassed = 0;
let testFailed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    testPassed++;
  } else {
    console.error(`[FAIL] ${testName}`);
    testFailed++;
  }
}

async function runTests() {
  console.log('=== RUNNING INSFORGE FULL BACKEND VERIFICATION ===\n');

  // Test 1: Admin Login
  console.log('--- Test 1: Admin Login ---');
  const { data: adminLogin, error: adminErr } = await insforge.auth.signInWithPassword({
    email: 'admin@campusfix.edu',
    password: 'Password@123',
  });
  assert(!adminErr && adminLogin?.user?.email === 'admin@campusfix.edu', 'Admin authentication succeeded');

  const { data: adminProfile } = await insforge.database
    .from('user_profiles')
    .select('*')
    .eq('id', adminLogin?.user?.id)
    .single();
  assert(adminProfile?.role === 'ADMIN', 'Admin profile verified in PostgreSQL with role ADMIN');

  await insforge.auth.signOut();

  // Test 2: Staff Login & Assigned Tasks
  console.log('\n--- Test 2: Staff Login & Task Visibility ---');
  const { data: staffLogin, error: staffErr } = await insforge.auth.signInWithPassword({
    email: 'ravi.shankar@staff.campusfix.edu',
    password: 'Password@123',
  });
  assert(!staffErr && staffLogin?.user?.email === 'ravi.shankar@staff.campusfix.edu', 'Staff authentication succeeded');

  const { data: staffProfile } = await insforge.database
    .from('user_profiles')
    .select('*')
    .eq('id', staffLogin?.user?.id)
    .single();
  assert(staffProfile?.role === 'STAFF', 'Staff profile verified with role STAFF');

  const { data: staffComplaints } = await insforge.database
    .from('complaints')
    .select('*')
    .eq('assigned_to', staffLogin?.user?.id);
  assert(staffComplaints && staffComplaints.length > 0, `Staff sees ${staffComplaints?.length || 0} assigned tasks in PostgreSQL`);

  await insforge.auth.signOut();

  // Test 3: New Student Registration
  console.log('\n--- Test 3: Student Registration ---');
  const testStudentEmail = `student_${Date.now()}@student.campusfix.edu`;
  const testRoll = `24CS${Math.floor(100 + Math.random() * 900)}`;

  const { data: newStudentAuth, error: regErr } = await insforge.auth.signUp({
    email: testStudentEmail,
    password: 'Password@123',
    name: 'Rohit Verma',
  });
  assert(!regErr && newStudentAuth?.user?.id, `Student registration succeeded for ${testStudentEmail}`);

  const studentUserId = newStudentAuth?.user?.id;
  const { error: newProfileErr } = await insforge.database
    .from('user_profiles')
    .insert([
      {
        id: studentUserId,
        email: testStudentEmail,
        name: 'Rohit Verma',
        role: 'STUDENT',
        roll_number: testRoll,
        department: 'Computer Science Engineering',
        program: 'B.Tech',
        academic_year: '2024-2028',
        section: 'B',
        avatar_initials: 'RV',
        avatar_color: 'bg-indigo-600',
        is_active: true,
      },
    ]);
  assert(!newProfileErr, 'Student profile persisted to PostgreSQL user_profiles');

  // Test 4: Student Submit Complaint
  console.log('\n--- Test 4: Student Submits Complaint ---');
  const newTicketId = `CF-2026-${Math.floor(5000 + Math.random() * 4000)}`;
  const { data: createdComplaint, error: createCompErr } = await insforge.database
    .from('complaints')
    .insert([
      {
        id: newTicketId,
        title: 'Projector HDMI port damaged in Seminar Hall',
        description: 'The projector HDMI cable pin is bent and video output is flickering.',
        category: 'IT_NETWORK',
        priority: 'MEDIUM',
        status: 'SUBMITTED',
        location: { building: 'Aryabhatta Academic Block', floor: '1st Floor', room: 'Seminar Hall 1' },
        reported_by: studentUserId,
        reported_by_name: 'Rohit Verma',
        reported_by_email: testStudentEmail,
        timeline: [
          { status: 'SUBMITTED', at: new Date().toISOString(), by: studentUserId, note: 'Submitted via student portal' },
        ],
      },
    ])
    .select()
    .single();
  assert(!createCompErr && createdComplaint?.id === newTicketId, `Complaint ${newTicketId} successfully inserted into PostgreSQL`);

  // Test 5: Verify Student Sees Their Own Complaint
  console.log('\n--- Test 5: Verify Student Complaint Query ---');
  const { data: myComplaints, error: queryErr } = await insforge.database
    .from('complaints')
    .select('*')
    .eq('reported_by', studentUserId);
  assert(!queryErr && myComplaints.some((c) => c.id === newTicketId), 'Student query returns their own submitted complaint');

  // Test 6: Storage Bucket Verification
  console.log('\n--- Test 6: Storage Bucket Evidence Upload ---');
  const dummyBuffer = Buffer.from('CampusFix visual evidence test image payload');
  const dummyFile = new Blob([dummyBuffer], { type: 'image/jpeg' });
  const testFileName = `test-evidence-${Date.now()}.jpg`;

  const { data: uploadData, error: uploadErr } = await insforge.storage
    .from('complaint-evidence')
    .upload(testFileName, dummyFile);
  assert(!uploadErr && uploadData?.url, `Evidence uploaded to InsForge Storage bucket 'complaint-evidence'`);

  await insforge.auth.signOut();

  console.log(`\n========================================`);
  console.log(`TEST RESULTS: ${testPassed} PASSED, ${testFailed} FAILED`);
  console.log(`========================================\n`);

  if (testFailed > 0) {
    process.exit(1);
  }
}

runTests();

