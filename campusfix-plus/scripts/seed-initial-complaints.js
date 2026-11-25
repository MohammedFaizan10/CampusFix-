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

const studentId = '7f406885-fa81-4347-8bde-72826b24db42';
const staffElectricalId = '1776d639-1e32-4e06-956d-40377a4e540e';
const staffItId = '30a97080-f8d3-46c4-a928-6f8b006ed37d';

const SAMPLE_COMPLAINTS = [
  {
    id: 'CF-2026-0001',
    title: 'Ceiling Fan Sparking and Abnormal Humming',
    description: 'The ceiling fan in Lab 204 started emitting electric sparks when switched to maximum regulator speed.',
    category: 'ELECTRICAL',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    location: { building: 'Aryabhatta Academic Block', floor: '2nd Floor', room: 'Lab 204', landmark: 'Near window 3' },
    reported_by: studentId,
    reported_by_name: 'Arjun Mehta',
    reported_by_email: 'arjun.mehta@student.campusfix.edu',
    assigned_to: staffElectricalId,
    assigned_to_name: 'Ravi Shankar',
    department: 'ELECTRICAL',
    evidence: [],
    timeline: [
      { status: 'SUBMITTED', at: '2026-11-10T09:30:00Z', by: studentId, note: 'Issue submitted by student.' },
      { status: 'UNDER_REVIEW', at: '2026-11-10T10:15:00Z', by: 'admin', note: 'Reviewed by Estate Admin.' },
      { status: 'ASSIGNED', at: '2026-11-10T11:00:00Z', by: 'admin', note: 'Assigned to Senior Electrician Ravi Shankar.' },
      { status: 'IN_PROGRESS', at: '2026-11-11T09:00:00Z', by: staffElectricalId, note: 'Capacitor and regulator replacement in progress.' },
    ],
    comments: [
      { id: 'c1', by: 'Ravi Shankar', at: '2026-11-11T09:05:00Z', text: 'Inspected fan unit. Replacing burnt regulator.' }
    ],
    internal_notes: [],
  },
  {
    id: 'CF-2026-0002',
    title: 'Severe Water Seepage and Damp Patches on Corridor Wall',
    description: 'Persistent moisture leakage and paint blistering along the 3rd floor corridor adjoining washroom line.',
    category: 'PLUMBING',
    priority: 'HIGH',
    status: 'SUBMITTED',
    location: { building: 'Sir CV Raman Science Block', floor: '3rd Floor', room: 'East Wing Corridor', landmark: 'Next to Room 312' },
    reported_by: studentId,
    reported_by_name: 'Arjun Mehta',
    reported_by_email: 'arjun.mehta@student.campusfix.edu',
    assigned_to: null,
    assigned_to_name: null,
    department: 'PLUMBING',
    evidence: [],
    timeline: [
      { status: 'SUBMITTED', at: '2026-11-14T14:20:00Z', by: studentId, note: 'Reported with AI Computer Vision analysis.' }
    ],
    ai_analysis: {
      suggested_category: 'PLUMBING',
      suggested_priority: 'HIGH',
      confidence: 0.88,
      summary: 'Water seepage moisture discoloration detected on masonry surface.'
    },
    comments: [],
    internal_notes: [],
  },
  {
    id: 'CF-2026-0003',
    title: 'Wi-Fi Access Point Frequent Disconnections',
    description: 'AP-CVR-302 drops connections every 10 minutes during peak lecture hours.',
    category: 'IT_NETWORK',
    priority: 'MEDIUM',
    status: 'ASSIGNED',
    location: { building: 'Sir CV Raman Science Block', floor: '3rd Floor', room: 'Lecture Hall 301', landmark: 'Ceiling mount' },
    reported_by: studentId,
    reported_by_name: 'Arjun Mehta',
    reported_by_email: 'arjun.mehta@student.campusfix.edu',
    assigned_to: staffItId,
    assigned_to_name: 'Mohammed Idris',
    department: 'IT_SERVICES',
    evidence: [],
    timeline: [
      { status: 'SUBMITTED', at: '2026-11-12T11:00:00Z', by: studentId, note: 'Issue logged.' },
      { status: 'ASSIGNED', at: '2026-11-12T14:00:00Z', by: 'admin', note: 'Assigned to IT Network team.' }
    ],
    comments: [],
    internal_notes: [],
  },
  {
    id: 'CF-2026-0004',
    title: 'Broken Handle on Library Emergency Exit Door',
    description: 'Panic push bar is detached on the west stairwell emergency door.',
    category: 'CIVIL',
    priority: 'HIGH',
    status: 'RESOLVED',
    location: { building: 'Central Library', floor: 'Ground Floor', room: 'West Exit', landmark: 'Near Fire Stairwell' },
    reported_by: studentId,
    reported_by_name: 'Arjun Mehta',
    reported_by_email: 'arjun.mehta@student.campusfix.edu',
    assigned_to: null,
    assigned_to_name: null,
    department: 'CIVIL',
    resolved_at: '2026-11-13T16:30:00Z',
    evidence: [],
    timeline: [
      { status: 'SUBMITTED', at: '2026-11-12T08:00:00Z', by: studentId, note: 'Safety issue reported.' },
      { status: 'RESOLVED', at: '2026-11-13T16:30:00Z', by: 'staff', note: 'Replaced hardware bolt assembly.' }
    ],
    comments: [],
    internal_notes: [],
  }
];

async function seedComplaints() {
  console.log('Seeding complaints into InsForge database...');

  // Sign in as admin to bypass RLS for seeding
  const { data: authData, error: authError } = await insforge.auth.signInWithPassword({
    email: 'admin@campusfix.edu',
    password: 'Password@123',
  });

  if (authError) {
    console.error('Failed to authenticate as admin for complaint seeding:', authError.message);
    return;
  }

  console.log('Authenticated as admin:', authData.user.email);

  for (const c of SAMPLE_COMPLAINTS) {
    const { error } = await insforge.database
      .from('complaints')
      .upsert([c]);

    if (error) {
      console.error(`Error inserting complaint ${c.id}:`, error.message);
    } else {
      console.log(`Inserted complaint ${c.id}: ${c.title}`);
    }
  }

  await insforge.auth.signOut();
  console.log('Complaints seeding completed!');
}

seedComplaints();

