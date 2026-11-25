import { createClient } from '@insforge/sdk';
import fs from 'fs';
import path from 'path';

// Read config
const projectConfig = JSON.parse(
  fs.readFileSync(path.resolve('../.insforge/project.json'), 'utf8')
);

const insforge = createClient({
  baseUrl: projectConfig.oss_host,
  anonKey: 'anon_bdcdf3182a2bf594f8d960816996f680539c5963047f59e0047bf71b20c1bbab',
});

const SEED_USERS = [
  {
    email: 'admin@campusfix.edu',
    password: 'Password@123',
    name: 'Dr. Vikram Anand',
    role: 'ADMIN',
    employee_id: 'ADM-001',
    designation: 'Facilities Manager',
    department: 'Administrative Office',
    avatar_initials: 'VA',
    avatar_color: 'bg-teal-600',
  },
  {
    email: 'ravi.shankar@staff.campusfix.edu',
    password: 'Password@123',
    name: 'Ravi Shankar',
    role: 'STAFF',
    employee_id: 'STF-001',
    designation: 'Senior Electrician',
    department: 'ELECTRICAL',
    avatar_initials: 'RS',
    avatar_color: 'bg-amber-500',
  },
  {
    email: 'idris.m@staff.campusfix.edu',
    password: 'Password@123',
    name: 'Mohammed Idris',
    role: 'STAFF',
    employee_id: 'STF-002',
    designation: 'Network Technician',
    department: 'IT_SERVICES',
    avatar_initials: 'MI',
    avatar_color: 'bg-violet-500',
  },
  {
    email: 'arjun.mehta@student.campusfix.edu',
    password: 'Password@123',
    name: 'Arjun Mehta',
    role: 'STUDENT',
    roll_number: '21CS101',
    department: 'Computer Science Engineering',
    program: 'B.Tech',
    academic_year: '2023-2027',
    section: 'A',
    avatar_initials: 'AM',
    avatar_color: 'bg-indigo-600',
  },
];

async function seed() {
  console.log('Seeding initial accounts into InsForge...');

  for (const u of SEED_USERS) {
    try {
      console.log(`Creating user: ${u.email}...`);
      const { data: signUpData, error: signUpError } = await insforge.auth.signUp({
        email: u.email,
        password: u.password,
        name: u.name,
      });

      let userId = signUpData?.user?.id;

      if (signUpError) {
        console.log(`SignUp message: ${signUpError.message}. Attempting sign-in to verify...`);
        const { data: signInData, error: signInError } = await insforge.auth.signInWithPassword({
          email: u.email,
          password: u.password,
        });
        if (signInError) {
          console.error(`Failed sign-in for ${u.email}:`, signInError.message);
          continue;
        }
        userId = signInData?.user?.id;
      }

      if (!userId) {
        console.error(`No userId found for ${u.email}`);
        continue;
      }

      console.log(`User ${u.email} authenticated. ID: ${userId}`);

      // Upsert profile in user_profiles
      const { error: profileError } = await insforge.database
        .from('user_profiles')
        .upsert([
          {
            id: userId,
            email: u.email,
            name: u.name,
            role: u.role,
            roll_number: u.roll_number || null,
            employee_id: u.employee_id || null,
            designation: u.designation || null,
            department: u.department || null,
            program: u.program || null,
            academic_year: u.academic_year || null,
            section: u.section || null,
            avatar_initials: u.avatar_initials,
            avatar_color: u.avatar_color,
            is_active: true,
          },
        ]);

      if (profileError) {
        console.error(`Error inserting profile for ${u.email}:`, profileError.message);
      } else {
        console.log(`Profile created successfully for ${u.email} with role ${u.role}`);
      }

      await insforge.auth.signOut();
    } catch (err) {
      console.error(`Exception seeding ${u.email}:`, err);
    }
  }

  console.log('Seeding complete!');
}

seed();

