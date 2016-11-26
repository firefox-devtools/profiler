

export function uploadBinaryProfileData(data) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.onload = e => {
      if (xhr.status == 200) {
        resolve(xhr.responseText);
      } else {
        reject(xhr.status);
      }
    };

    xhr.onerror = e => {
      reportStatus(xhr.status);
    }

    xhr.upload.onprogress = e => {
      if (e.lengthComputable) {
        const progress = e.loaded / e.total;
      }
    };

    xhr.open("POST", "https://profile-store.appspot.com/compressed-store");
    xhr.send(data);
  });
}
