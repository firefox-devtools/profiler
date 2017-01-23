

export function uploadBinaryProfileData(data, progressChangeCallback = undefined) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.onload = () => {
      if (xhr.status === 200) {
        resolve(xhr.responseText);
      } else {
        reject(xhr.status);
      }
    };

    xhr.onerror = () => {
      reject(xhr.status);
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
