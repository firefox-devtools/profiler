

export function uploadBinaryProfileData(data, progressChangeCallback = undefined) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.onload = () => {
      if (xhr.status === 200) {
        resolve(xhr.responseText);
      } else {
        reject(`xhr onload with status != 200, xhr.statusText: ${xhr.statusText}`);
      }
    };

    xhr.onerror = () => {
      reject(`xhr onerror was called, xhr.statusText: ${xhr.statusText}`);
    };

    xhr.upload.onprogress = e => {
      if (progressChangeCallback && e.lengthComputable) {
        progressChangeCallback(e.loaded / e.total);
      }
    };

    xhr.open('POST', 'https://profile-store.appspot.com/compressed-store');
    xhr.send(data);
  });
}
