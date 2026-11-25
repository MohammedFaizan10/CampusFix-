/**
 * test-all-features.js
 * End-to-end integration and security test suite covering:
 * TEST 1-3: Multi-role authentication (Student, Admin, Staff)
 * TEST 4: Realtime complaint insertion, admin/staff delivery, and automated notification generation
 * TEST 5: Realtime complaint status update and student/admin delivery
 * TEST 6: Account provisioning via secure Edge Function (Direct creation + Invitation onboarding)
 * TEST 7: Security & RLS verification (Admin data isolation, Cross-department isolation, RLS on notifications and channels)
 */

import { createClient } from '@insforge/sdk';

const BASE_URL = 'https://pyejv9t8.us-east.insforge.app';
const ANON_KEY = 'anon_bdcdf3182a2bf594f8d960816996f680539c5963047f59e0047bf71b20c1bbab';

function makeClient() {
  return createClient({ baseUrl: BASE_URL, anonKey: ANON_KEY });
}

async function runTests() {
  console.log('================================================================');
  console.log('   CAMPUSFIX+ E2E VERIFICATION: AUTH, REALTIME, PROVISIONING    ');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, desc) {
    total++;
    if (condition) {
      console.log(`  [PASS] ${desc}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${desc}`);
      throw new Error(`Assertion failed: ${desc}`);
    }
  }

  const clientStudent = makeClient();
  const clientAdmin = makeClient();
  const clientStaff = makeClient();

  // TEST 1: Log in as student
  console.log('\n--- TEST 1: Student Authentication ---');
  const studentLogin = await clientStudent.auth.signInWithPassword({
    email: 'arjun.mehta@student.campusfix.edu',
    password: 'Password@123',
  });
  assert(studentLogin.data?.user?.id, 'Student logged in successfully');
  const studentId = studentLogin.data.user.id;

  // TEST 2: Log in as admin
  console.log('\n--- TEST 2: Admin Authentication ---');
  const adminLogin = await clientAdmin.auth.signInWithPassword({
    email: 'admin@campusfix.edu',
    password: 'Password@123',
  });
  assert(adminLogin.data?.user?.id, 'Admin logged in successfully');
  const adminId = adminLogin.data.user.id;

  // TEST 3: Log in as staff (Ravi Shankar - Electrical)
  console.log('\n--- TEST 3: Maintenance Staff Authentication ---');
  const staffLogin = await clientStaff.auth.signInWithPassword({
    email: 'ravi.shankar@staff.campusfix.edu',
    password: 'Password@123',
  });
  assert(staffLogin.data?.user?.id, 'Staff logged in successfully');
  const staffId = staffLogin.data.user.id;

  // Connect WebSockets
  console.log('\n--- Connecting Realtime Sockets ---');
  await clientStudent.realtime.connect();
  await clientAdmin.realtime.connect();
  await clientStaff.realtime.connect();

  assert(clientStudent.realtime.isConnected, 'Student Realtime connected');
  assert(clientAdmin.realtime.isConnected, 'Admin Realtime connected');
  assert(clientStaff.realtime.isConnected, 'Staff Realtime connected');

  // Subscribing to authorized channels
  const adminSub = await clientAdmin.realtime.subscribe('complaints:all');
  assert(adminSub.ok, 'Admin subscribed to complaints:all');

  const staffDeptSub = await clientStaff.realtime.subscribe('complaints:dept:ELECTRICAL');
  assert(staffDeptSub.ok, 'Staff subscribed to complaints:dept:ELECTRICAL');

  const staffNotifSub = await clientStaff.realtime.subscribe(`notifications:user:${staffId}`);
  assert(staffNotifSub.ok, `Staff subscribed to notifications:user:${staffId}`);

  const studentSub = await clientStudent.realtime.subscribe(`complaints:user:${studentId}`);
  assert(studentSub.ok, `Student subscribed to complaints:user:${studentId}`);

  const studentNotifSub = await clientStudent.realtime.subscribe(`notifications:user:${studentId}`);
  assert(studentNotifSub.ok, `Student subscribed to notifications:user:${studentId}`);

  // TEST 4: Student Submits Complaint & Realtime Broadcast
  console.log('\n--- TEST 4: Real-time Complaint Submission & Notification Delivery ---');

  let adminReceivedComplaint = false;
  let staffReceivedComplaint = false;
  let staffReceivedNotification = false;

  const testComplaintId = `CF-TEST-${Date.now()}`;

  clientAdmin.realtime.on('complaint_created', (payload) => {
    if (payload.id === testComplaintId) {
      adminReceivedComplaint = true;
    }
  });

  clientStaff.realtime.on('complaint_created', (payload) => {
    if (payload.id === testComplaintId) {
      staffReceivedComplaint = true;
    }
  });

  clientStaff.realtime.on('new_notification', (payload) => {
    if (payload.complaint_id === testComplaintId) {
      staffReceivedNotification = true;
    }
  });

  const { error: insertErr } = await clientStudent.database.from('complaints').insert([
    {
      id: testComplaintId,
      title: 'Power Outage in Engineering Lab 3',
      description: 'Breaker tripped causing loss of power to test benches',
      category: 'ELECTRICAL',
      priority: 'HIGH',
      status: 'SUBMITTED',
      department: 'ELECTRICAL',
      location: { building: 'Aryabhatta Block', floor: '1st Floor', room: 'Lab 103' },
      reported_by: studentId,
      reported_by_name: 'Arjun Mehta',
      reported_by_email: 'arjun.mehta@student.campusfix.edu',
    },
  ]);

  assert(!insertErr, 'Complaint saved in InsForge PostgreSQL');

  // Wait for realtime events to be propagated
  await new Promise((r) => setTimeout(r, 3000));

  assert(adminReceivedComplaint, 'Admin Browser received new complaint in real time');
  assert(staffReceivedComplaint, 'Electrical Staff Browser received complaint in real time');
  assert(staffReceivedNotification, 'Electrical Staff received automated in-app notification in real time');

  // Verify notifications persisted in PostgreSQL
  const { data: staffNotifs } = await clientStaff.database
    .from('notifications')
    .select('*')
    .eq('recipient_id', staffId)
    .eq('complaint_id', testComplaintId);

  assert(staffNotifs && staffNotifs.length > 0, 'Notification persisted in PostgreSQL database');

  // TEST 5: Change Complaint Status by Staff -> Student & Admin Realtime Visibility
  console.log('\n--- TEST 5: Real-time Complaint Status Update ---');

  let studentReceivedStatusUpdate = false;
  let adminReceivedStatusUpdate = false;
  let studentReceivedStatusNotif = false;

  clientStudent.realtime.on('complaint_updated', (payload) => {
    if (payload.id === testComplaintId && payload.status === 'IN_PROGRESS') {
      studentReceivedStatusUpdate = true;
    }
  });

  clientStudent.realtime.on('new_notification', (payload) => {
    if (payload.complaint_id === testComplaintId) {
      studentReceivedStatusNotif = true;
    }
  });

  clientAdmin.realtime.on('complaint_updated', (payload) => {
    if (payload.id === testComplaintId && payload.status === 'IN_PROGRESS') {
      adminReceivedStatusUpdate = true;
    }
  });

  // Staff updates status to IN_PROGRESS
  const { error: updateErr } = await clientStaff.database
    .from('complaints')
    .update({
      status: 'IN_PROGRESS',
      assigned_to: staffId,
      assigned_to_name: 'Ravi Shankar',
      updated_at: new Date().toISOString(),
    })
    .eq('id', testComplaintId);

  assert(!updateErr, 'Staff updated complaint status in PostgreSQL');

  await new Promise((r) => setTimeout(r, 3000));

  assert(studentReceivedStatusUpdate, 'Student Browser received status change in real time');
  assert(adminReceivedStatusUpdate, 'Admin Browser received status change in real time');
  assert(studentReceivedStatusNotif, 'Student received status update notification');

  // TEST 6: Account Provisioning via Edge Function
  console.log('\n--- TEST 6: Account Provisioning & Secure Invitation Workflow ---');

  const newStaffEmail = `test.technician.${Date.now()}@staff.campusfix.edu`;
  const provisionRes = await clientAdmin.functions.invoke('provision-user', {
    body: {
      action: 'provision',
      email: newStaffEmail,
      name: 'Prakash Verma',
      role: 'MAINTENANCE_STAFF',
      department: 'CIVIL',
      designation: 'Masonry Specialist',
      employee_id: `STF-${Math.floor(1000 + Math.random() * 9000)}`,
      password: 'Password@123',
    },
  });
  console.log('TEST 6 provision response:', provisionRes.data, provisionRes.error);

  assert(provisionRes.data?.success, 'Admin provisioned staff account via Edge Function');

  // Verify the newly provisioned staff can log in
  const clientNewStaff = makeClient();
  const newStaffLogin = await clientNewStaff.auth.signInWithPassword({
    email: newStaffEmail,
    password: 'Password@123',
  });
  assert(newStaffLogin.data?.user?.id, 'Newly provisioned staff successfully logged in');

  // Verify profile loaded correctly from database
  const { data: newStaffProf } = await clientNewStaff.database
    .from('user_profiles')
    .select('*')
    .eq('id', newStaffLogin.data.user.id)
    .single();

  assert(newStaffProf.role === 'MAINTENANCE_STAFF', 'Profile role is MAINTENANCE_STAFF');
  assert(newStaffProf.department === 'CIVIL', 'Profile department is CIVIL');

  // TEST 6B: Invitation Flow via Edge Function
  console.log('\n--- TEST 6B: Invitation Creation and Acceptance Workflow ---');
  const inviteEmail = `invitee.${Date.now()}@campusfix.edu`;
  const inviteRes = await clientAdmin.functions.invoke('provision-user', {
    body: {
      action: 'invite',
      email: inviteEmail,
      name: 'Sunil Kumar',
      role: 'DEPARTMENT_STAFF',
      department: 'PLUMBING',
      designation: 'Plumbing Inspector',
      employee_id: `EMP-${Math.floor(100 + Math.random() * 900)}`,
    },
  });

  assert(inviteRes.data?.success, 'Admin generated secure invitation');
  const inviteToken = inviteRes.data.invitation.token;
  assert(inviteToken, 'Invitation token generated');

  // Invitee accepts invitation and sets password
  const acceptClient = makeClient();
  const acceptRes = await acceptClient.functions.invoke('provision-user', {
    body: {
      action: 'accept_invitation',
      token: inviteToken,
      password: 'Password@123',
    },
  });
  assert(acceptRes.data?.success, 'Invitee accepted invitation and set password');

  // Invitee logs in
  const inviteeLogin = await acceptClient.auth.signInWithPassword({
    email: inviteEmail,
    password: 'Password@123',
  });
  assert(inviteeLogin.data?.user?.id, 'Invited user successfully logged in after activation');

  // TEST 7: Security and RLS Verification
  console.log('\n--- TEST 7: Security & RLS Policy Verification ---');

  // 7A: Student cannot read another user's notifications
  const { data: studentHackedNotifs } = await clientStudent.database
    .from('notifications')
    .select('*')
    .eq('recipient_id', staffId);
  assert(studentHackedNotifs.length === 0, 'RLS: Student cannot read staff notifications');

  // 7B: Staff cannot subscribe to unauthorized channels
  const hackCivilSub = await clientStaff.realtime.subscribe('complaints:dept:CIVIL');
  assert(!hackCivilSub.ok, 'RLS: Electrical staff CANNOT subscribe to complaints:dept:CIVIL');

  const hackAdminSub = await clientStaff.realtime.subscribe('complaints:all');
  assert(!hackAdminSub.ok, 'RLS: Staff CANNOT subscribe to global complaints:all');

  // 7C: Audit log verification
  const { data: auditEntries, error: auditQueryErr } = await clientAdmin.database
    .from('account_audit_logs')
    .select('*')
    .eq('target_email', newStaffEmail);
  console.log('7C query for:', newStaffEmail, { count: auditEntries?.length, auditQueryErr });
  assert(auditEntries && auditEntries.length > 0, 'Account provisioning logged in account_audit_logs');

  // Cleanup test data
  console.log('\n--- Cleaning up test artifacts ---');
  await clientAdmin.database.from('complaints').delete().eq('id', testComplaintId);

  await clientStudent.realtime.disconnect();
  await clientAdmin.realtime.disconnect();
  await clientStaff.realtime.disconnect();
  await clientNewStaff.realtime?.disconnect();
  await acceptClient.realtime?.disconnect();

  console.log('\n================================================================');
  console.log(`   ALL TESTS COMPLETED: ${passed}/${total} PASSED`);
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('\nTest suite failed with error:', err);
  process.exit(1);
});
