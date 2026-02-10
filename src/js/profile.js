const profileToggle = document.getElementById('profileToggle');
const profileMenu = document.getElementById('profileMenu');
const logoutButton = document.getElementById('logoutButton');

const profileForm = document.getElementById('profileForm');
const profileMessage = document.getElementById('profileMessage');
const resetProfile = document.getElementById('resetProfile');
const profileImage = document.getElementById('profileImage');
const profileName = document.getElementById('profileName');
const profileCourse = document.getElementById('profileCourse');
const photoInput = document.getElementById('photoInput');
const mainCourseSelect = document.getElementById('mainCourseSelect');
const subCoursesSelect = document.getElementById('subCoursesSelect');

let savedProfile = null;

function closeMenuOnOutsideClick(event) {
  if (!profileMenu || !profileToggle) return;
  if (!profileMenu.contains(event.target) && !profileToggle.contains(event.target)) {
    profileMenu.classList.add('is-hidden');
  }
}

if (profileToggle && profileMenu) {
  profileToggle.addEventListener('click', () => {
    profileMenu.classList.toggle('is-hidden');
  });
  document.addEventListener('click', closeMenuOnOutsideClick);
}

if (logoutButton) {
  logoutButton.addEventListener('click', async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch (error) {
      // best effort logout
    }
    window.location.href = '/login';
  });
}

function populateCourses(courses) {
  courses.forEach((course) => {
    const option = document.createElement('option');
    option.value = course.course_name;
    option.textContent = course.course_name;
    mainCourseSelect.appendChild(option);

    const subOption = document.createElement('option');
    subOption.value = course.course_name;
    subOption.textContent = course.course_name;
    subCoursesSelect.appendChild(subOption);
  });
}

function setProfileFields(profile) {
  profileForm.elements.display_name.value = profile.display_name || '';
  profileForm.elements.bio.value = profile.bio || '';
  profileForm.elements.main_course.value = profile.main_course || '';
  profileForm.elements.facebook.value = profile.facebook || '';
  profileForm.elements.linkedin.value = profile.linkedin || '';
  profileForm.elements.instagram.value = profile.instagram || '';
  profileForm.elements.github.value = profile.github || '';
  profileForm.elements.portfolio.value = profile.portfolio || '';

  const subs = Array.isArray(profile.sub_courses) ? profile.sub_courses : [];
  Array.from(subCoursesSelect.options).forEach((option) => {
    option.selected = subs.includes(option.value);
  });

  profileName.textContent = profile.display_name || 'Profile';
  profileCourse.textContent = profile.main_course || 'Main course';
  if (profile.photo_link) {
    profileImage.src = profile.photo_link;
  }
}

async function loadProfile() {
  const response = await fetch('/api/profile');
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.message || 'Failed to load profile.');
  }
  savedProfile = data.profile;
  setProfileFields(savedProfile);
}

async function loadCourses() {
  const response = await fetch('/api/library/courses');
  const data = await response.json();
  if (response.ok && data.ok) {
    populateCourses(data.courses);
  }
}

async function saveProfile(event) {
  event.preventDefault();
  profileMessage.textContent = '';

  const selectedSubs = Array.from(subCoursesSelect.selectedOptions).map((option) => option.value);
  const payload = {
    display_name: profileForm.elements.display_name.value,
    bio: profileForm.elements.bio.value,
    main_course: profileForm.elements.main_course.value,
    sub_courses: selectedSubs,
    facebook: profileForm.elements.facebook.value,
    linkedin: profileForm.elements.linkedin.value,
    instagram: profileForm.elements.instagram.value,
    github: profileForm.elements.github.value,
    portfolio: profileForm.elements.portfolio.value,
  };

  const response = await fetch('/api/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    profileMessage.textContent = data.message || 'Failed to save profile.';
    return;
  }
  savedProfile = data.profile;
  setProfileFields(savedProfile);
  profileMessage.textContent = 'Profile saved.';
}

async function resetFields() {
  if (savedProfile) {
    setProfileFields(savedProfile);
    profileMessage.textContent = '';
  }
}

async function uploadPhoto() {
  if (!photoInput.files.length) return;
  const formData = new FormData();
  formData.append('photo', photoInput.files[0]);
  const response = await fetch('/api/profile/photo', {
    method: 'POST',
    body: formData,
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    profileMessage.textContent = data.message || 'Failed to upload photo.';
    return;
  }
  profileImage.src = data.photo_link;
  profileMessage.textContent = 'Photo updated.';
}

if (profileForm) {
  profileForm.addEventListener('submit', saveProfile);
}

if (resetProfile) {
  resetProfile.addEventListener('click', resetFields);
}

if (photoInput) {
  photoInput.addEventListener('change', uploadPhoto);
}

loadCourses().then(loadProfile).catch((error) => {
  profileMessage.textContent = error.message;
});
