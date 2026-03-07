-- Subject/unit seed data for Cloud SQL import
-- This script inserts canonical units for:
-- - Computer Science
-- - History
-- - Psychology
-- - Physics
-- - Civil Engineering
--
-- Safe to run multiple times.

BEGIN;

WITH subject_seed (course_name, subject_name) AS (
  VALUES
    -- Computer Science
    ('Computer Science', 'Introduction to Computing'),
    ('Computer Science', 'Fundamentals of Programming'),
    ('Computer Science', 'Computer Programming 1'),
    ('Computer Science', 'Computer Programming 2'),
    ('Computer Science', 'Intermediate Programming'),
    ('Computer Science', 'Object-Oriented Programming'),
    ('Computer Science', 'Data Structures and Algorithms'),
    ('Computer Science', 'Information Management / Database Systems'),
    ('Computer Science', 'Applications Development and Emerging Technologies'),
    ('Computer Science', 'Discrete Structures 1'),
    ('Computer Science', 'Discrete Structures 2'),
    ('Computer Science', 'Programming Languages'),
    ('Computer Science', 'Algorithms and Complexity'),
    ('Computer Science', 'Automata Theory and Formal Languages'),
    ('Computer Science', 'Networks and Communications'),
    ('Computer Science', 'Operating Systems'),
    ('Computer Science', 'Computer Architecture and Organization'),
    ('Computer Science', 'Software Engineering 1'),
    ('Computer Science', 'Software Engineering 2'),
    ('Computer Science', 'Information Assurance and Security'),
    ('Computer Science', 'Human-Computer Interaction'),
    ('Computer Science', 'Social and Professional Issues'),
    ('Computer Science', 'Professional Ethics in Computing'),
    ('Computer Science', 'Systems Analysis and Design'),
    ('Computer Science', 'Project Management'),
    ('Computer Science', 'Modeling and Simulation'),
    ('Computer Science', 'Networking courses'),
    ('Computer Science', 'Multimedia Technologies'),
    ('Computer Science', 'Thesis 1'),
    ('Computer Science', 'Thesis 2'),
    ('Computer Science', 'Practicum / OJT'),
    ('Computer Science', 'Electives / Specialization courses'),

    -- History
    ('History', 'Introduction to the Study and Writing of History'),
    ('History', 'Historical Methodology'),
    ('History', 'Philosophy of History'),
    ('History', 'Survey of Asian Civilizations'),
    ('History', 'Survey of Western Civilization'),
    ('History', 'Spanish 1'),
    ('History', 'Spanish 2'),
    ('History', 'Spanish 3'),
    ('History', 'Spanish 4'),

    -- Psychology
    ('Psychology', 'Introduction to Psychology'),
    ('Psychology', 'Psychological Statistics'),
    ('Psychology', 'Developmental Psychology'),
    ('Psychology', 'Theories of Personality'),
    ('Psychology', 'Cognitive Psychology'),
    ('Psychology', 'Abnormal Psychology I'),
    ('Psychology', 'Abnormal Psychology II'),
    ('Psychology', 'Experimental Psychology'),
    ('Psychology', 'Physiological Psychology'),
    ('Psychology', 'Psychological Assessment'),
    ('Psychology', 'Introduction to Counseling'),
    ('Psychology', 'Social Psychology'),
    ('Psychology', 'Field Methods in Psychology'),
    ('Psychology', 'Industrial/Organizational Psychology'),
    ('Psychology', 'Code of Ethics in Psychology'),
    ('Psychology', 'Research in Psychology I'),
    ('Psychology', 'Research in Psychology II'),
    ('Psychology', 'Filipino Psychology'),
    ('Psychology', 'Practicum in Psychology'),

    -- Physics
    ('Physics', 'University Physics I (Lecture)'),
    ('Physics', 'University Physics I (Laboratory)'),
    ('Physics', 'Computational Physics I (Lecture)'),
    ('Physics', 'Computational Physics I (Laboratory)'),
    ('Physics', 'University Physics II (Lecture)'),
    ('Physics', 'University Physics II (Laboratory)'),
    ('Physics', 'Computational Physics II (Lecture)'),
    ('Physics', 'Computational Physics II (Laboratory)'),
    ('Physics', 'University Physics III (Lecture)'),
    ('Physics', 'University Physics III (Laboratory)'),
    ('Physics', 'Computational Physics III (Lecture)'),
    ('Physics', 'Computational Physics III (Laboratory)'),
    ('Physics', 'University Physics IV (Lecture)'),
    ('Physics', 'University Physics IV (Laboratory)'),
    ('Physics', 'Mathematical Physics I'),
    ('Physics', 'Mathematical Physics II'),
    ('Physics', 'Mathematical Physics III'),
    ('Physics', 'Modern Physics'),
    ('Physics', 'Theoretical Mechanics I'),
    ('Physics', 'Theoretical Mechanics II'),
    ('Physics', 'Quantum Mechanics I'),
    ('Physics', 'Quantum Mechanics II'),
    ('Physics', 'Electromagnetism I'),
    ('Physics', 'Electromagnetism II'),
    ('Physics', 'Advanced Laboratory'),
    ('Physics', 'Electronics (Lecture)'),
    ('Physics', 'Electronics (Laboratory)'),
    ('Physics', 'Optics'),
    ('Physics', 'Statistical Mechanics'),
    ('Physics', 'Physics Research I'),
    ('Physics', 'Physics Research II'),
    ('Physics', 'Solid State Physics'),

    -- Civil Engineering
    ('Civil Engineering', 'Development and Trends in Civil Engineering'),
    ('Civil Engineering', 'Computer-Aided Drafting'),
    ('Civil Engineering', 'Fundamentals of Surveying'),
    ('Civil Engineering', 'Surveying Laboratory'),
    ('Civil Engineering', 'Dynamics of Rigid Bodies'),
    ('Civil Engineering', 'Geology for Civil Engineers'),
    ('Civil Engineering', 'Construction Materials'),
    ('Civil Engineering', 'Testing of Materials'),
    ('Civil Engineering', 'Structural Theory'),
    ('Civil Engineering', 'Numerical Solutions to Civil Engineering Problems'),
    ('Civil Engineering', 'Building Systems Design'),
    ('Civil Engineering', 'Environmental Science and Engineering'),
    ('Civil Engineering', 'Earthquake and Wind Engineering'),
    ('Civil Engineering', 'Highway and Railroad Engineering'),
    ('Civil Engineering', 'Engineering Utilities 1'),
    ('Civil Engineering', 'Principles of Steel Design'),
    ('Civil Engineering', 'Principles of Reinforced / Pre-stressed Concrete'),
    ('Civil Engineering', 'Hydraulics'),
    ('Civil Engineering', 'Hydraulics Laboratory'),
    ('Civil Engineering', 'Civil Engineering Laws, Ethics and Contracts'),
    ('Civil Engineering', 'Civil Engineering Project 1 (Undergraduate Research I)'),
    ('Civil Engineering', 'Internship 1'),
    ('Civil Engineering', 'Engineering Utilities 2'),
    ('Civil Engineering', 'Geotechnical Engineering 1 (Soil Mechanics)'),
    ('Civil Engineering', 'Geotechnical Engineering 1 (Laboratory)'),
    ('Civil Engineering', 'Principles of Transportation Engineering'),
    ('Civil Engineering', 'Hydrology'),
    ('Civil Engineering', 'Professional Course - Specialized 1'),
    ('Civil Engineering', 'Professional Course - Specialized 2'),
    ('Civil Engineering', 'Civil Engineering Project 2A (Undergraduate Research II)'),
    ('Civil Engineering', 'Engineering Management'),
    ('Civil Engineering', 'Internship 2'),
    ('Civil Engineering', 'Internship 3'),
    ('Civil Engineering', 'Civil Engineering Project 2B (Undergraduate Research II Lecture)'),
    ('Civil Engineering', 'Quantity Surveying'),
    ('Civil Engineering', 'Professional Course - Specialized 3'),
    ('Civil Engineering', 'Professional Course - Specialized 4'),
    ('Civil Engineering', 'Professional Course - Specialized 5'),
    ('Civil Engineering', 'Construction Methods and Project Management'),
    ('Civil Engineering', 'Computer Programs and Applications'),
    ('Civil Engineering', 'Professional Elective 1')
)
INSERT INTO subjects (
  course_code,
  course_name,
  subject_code,
  subject_name,
  description,
  created_by_uid,
  is_active,
  created_at,
  updated_at
)
SELECT
  c.course_code,
  seed.course_name,
  NULL,
  seed.subject_name,
  '',
  NULL,
  true,
  NOW(),
  NOW()
FROM subject_seed seed
LEFT JOIN courses c
  ON lower(c.course_name) = lower(seed.course_name)
ON CONFLICT (course_name, subject_name)
DO UPDATE SET
  course_code = COALESCE(EXCLUDED.course_code, subjects.course_code),
  is_active = true,
  updated_at = NOW();

COMMIT;

