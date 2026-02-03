const fs = require('fs');
const path = require('path');
const { loadEnv } = require('../config/env');

loadEnv();

const pool = require('./pool');

async function seedCourses() {
  const filePath = path.join(__dirname, '..', '..', 'assets', 'course-list.txt');
  const contents = fs.readFileSync(filePath, 'utf8');
  const courses = contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (courses.length === 0) {
    console.log('No courses found to seed.');
    return;
  }

  for (const course of courses) {
    await pool.query(
      'INSERT INTO courses (course_code, course_name) VALUES ($1, $2) ON CONFLICT (course_code) DO UPDATE SET course_name = EXCLUDED.course_name',
      [course, course]
    );
  }

  console.log(`Seeded ${courses.length} courses.`);
}

seedCourses()
  .catch((error) => {
    console.error('Course seeding failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    pool.end();
  });
