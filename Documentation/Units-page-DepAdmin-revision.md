Revise the Units page so that professors, DepAdmins, and Admins can create their own Topic thread in the units page and also, student posts in each unit or topic thread page must require approval from professors and DepAdmins

in units page(aside from the official Units) professors/DepAdmins can also add their own topic threads which is on a different tab
- These topic threads are similar to units in the way that the only their names are different(One is units and the other is threads. Both support postings and Unit/Thread AI)
- There should be a dedicated menu bar for browsing these units and threads. On the left most of the menu bar is the official units of the course of the student, next is the threads created by professors(if the user is a professor/DepAdmin, it will be called "Threads by me")
- Every post of students in units or threads must be approved by professors and DepAdmins before it gets posted in the threads/unit wall

- There is a button for every unit/threads which opens up the Thread moderation panel for that unit/thread. This is where the professors manage the students registered under that unit/thread, view/approve/reject post requests, and see reported content made in that thread/unit and take action regarding it(suspend for custom duration, warn, request for ban)

Some more changes:
- Change the name of the Admin in the nav bar to "Admin's console"

Clarifications:
- Professors are allowed to moderate all official units
- Threads are exclusive to the course the professor/DepAdmin is in
- Professors/DepAdmin bypass post approval
- Professors/DepAdmins can see whhich students are under that course(example: All students under computer science)
- Request for ban means sending a request to sys_admins to ban that user(Add another page in admin console for these requests)
- Only DepAdmins are allowed to create Official units(Only the create thread button is visible to professors while both(Units and threads) are visible to Depadmins)

Implementation decisions:
- Units and topic threads share the existing Units backend model, differentiated by `kind = unit|thread`. This avoids duplicating posting, reporting, AI, and membership logic.
- Student-created posts default to `pending` and are hidden from the public feed until approved. Professor, DepAdmin, admin, and owner posts auto-approve.
- Warnings and suspensions issued from a unit/thread moderation panel are local to that unit/thread membership, not platform-wide account punishments.
- Ban requests raised from a unit/thread moderation panel are escalations only. They create a dedicated admin-console queue and can only be resolved by admin/owner roles.
- Official unit creation is restricted to DepAdmins assigned to the target course. Professors only receive thread creation controls.
- Professors and DepAdmins see `Threads by me` to reduce cross-course noise. Students continue to see the course thread list.
