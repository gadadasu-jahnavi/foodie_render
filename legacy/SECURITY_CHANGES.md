# Foodie rider privacy and admin document-review changes

## Included changes
- Admin rider summaries remain limited to basic operational information in the admin bootstrap response.
- Admins must request an application-specific review link from the authenticated admin API before opening seller/rider registration details.
- Review links expire after two minutes and are read-only, scoped to one application and one applicant type.
- Uploaded files are served only when the requested relative path belongs to that application's uploaded documents. A scoped link cannot be used to fetch another rider's or seller's files.
- The admin frontend now requests a scoped review link when the user clicks **Details**; it no longer places the normal long-lived admin JWT in the URL.
- Tests were updated for scoped review-link behavior.

## Apply safely
1. Back up your active MySQL database `foodie_app_db` before replacing project files.
2. Stop the Foodie Flask server.
3. Copy the `backend` and `frontend` folders from this package into your existing project, replacing matching files. Keep your existing `backend/.env`, uploads folder and database unchanged.
4. Start the app and test rider login, admin rider registration review, approve/reject, and document viewing.
5. Run `python -m pytest tests -q` from the backend folder after activating your existing virtual environment.

## Important
The uploaded source archive contained `.env` and SQLite database files. They are intentionally not included in this output. Change the MySQL password and `SECRET_KEY` because credentials were included in an uploaded archive. Do not share `.env` or database files in future source uploads.

This is application-level authorization. Anyone with direct access to the MySQL server or server filesystem can still access stored data; secure database and server access separately.
