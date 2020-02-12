# Cloud Migration

We're investing a significant amount of time and effort to improve our
underlying server-side and cloud architecture.

## Why?

We want that the profiler service is handled by Mozilla's fantastic Cloud Ops
team so that it's better supported and safer for our users.

## What?

On **February 21 and 22** (they are Friday and Saturday) we want to move all our
storage data. In Google Cloud Platform we can't just change the ownership of a
bucket. Instead we need to copy all the data over —twice, if we want to keep the
same bucket name.

That's why we're planning some downtime on these dates.

## What does that mean for you?

If everything goes according to our plan:
* On February 21 we'll copy the data one-way. During that day you should still
  be able to access stored profiles, but won't be able to publish new profiles.
* On February 22 we'll copy the data to the new location. During that day you
  won't be able to access existing profiles. Possibly publishing new profiles
  and accessing them will work.

After the move everything should be back to normal.

**Note that you will still be able to capture profiles locally. Only the sharing
capability will be affected by the downtime.**
