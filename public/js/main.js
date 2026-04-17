document.addEventListener("DOMContentLoaded", function () {
    const customAlertModal = document.getElementById("customAlertModal");
    const customAlertTitle = document.getElementById("customAlertTitle");
    const customAlertMessage = document.getElementById("customAlertMessage");
    const customAlertOkBtn = document.getElementById("customAlertOkBtn");
    let alertCallback = null; 

    if (customAlertModal && customAlertOkBtn) {
        customAlertOkBtn.addEventListener('click', () => {
            customAlertModal.classList.add('hidden');
            document.body.classList.remove("modal-open");
            if (alertCallback) { 
                alertCallback(); 
                alertCallback = null; 
            }
        });
    }

    /**
     * @param {string} message The message to display.
     * @param {string} title The title of the alert (default: 'VisionSphere Alert').
     * @param {function} [callback=null] The function to execute when 'OK' is clicked. 
     */
    window.customAlert = function (message, title = "VisionSphere Alert", callback = null) {
        if (!customAlertModal) {
            console.error("Custom alert modal not found. Falling back to native alert.");
            alert(message);
            return;
        }
        customAlertTitle.textContent = title;
        customAlertMessage.textContent = message; 
        customAlertModal.classList.remove('hidden');
        document.body.classList.add("modal-open");
        
        alertCallback = callback; // Store the redirection function
    };


    // Avatar dropdown toggle
    document.addEventListener('click', function (e) {
        const avatar = document.querySelector('.avatar-container');
        const dropdown = document.getElementById('avatarDropdown');

        if (!avatar || !dropdown) return;

        if (avatar.contains(e.target)) {
            dropdown.style.display = dropdown.style.display === 'flex' ? 'none' : 'flex';
        } else {
            dropdown.style.display = 'none';
        }
    });

    // Modal Handling 
    const loginModal = document.getElementById("loginModal");
    const signupModal = document.getElementById("signupModal");
    const resetModal = document.getElementById("resetModal");
    const loginBtn = document.getElementById("loginBtn");
    const createPasswordModal = document.getElementById("createPasswordModal");

    // Toggle modals on outside click
    window.addEventListener("click", function (e) {
        if (e.target === loginModal) {
            loginModal.classList.add("hidden");
            document.body.classList.remove("modal-open");
        }
        if (e.target === signupModal) {
            signupModal.classList.add("hidden");
            document.body.classList.remove("modal-open");
        }
        if (e.target === resetModal) {
            resetModal.classList.add("hidden");
            document.body.classList.remove("modal-open");
        }
        if (e.target === createPasswordModal && !e.target.closest('.login-content')) {
            createPasswordModal.classList.add("hidden");
            document.body.classList.remove("modal-open");
        }
    });

    if (loginBtn) {
        loginBtn.addEventListener("click", () => {
            loginModal.classList.remove("hidden");
            signupModal?.classList.add("hidden");
            resetModal?.classList.add("hidden");
            document.body.classList.add("modal-open");
        });
    }

    window.toggleModals = function (target) {
        loginModal?.classList.add("hidden");
        signupModal?.classList.add("hidden");
        resetModal?.classList.add("hidden");
        createPasswordModal?.classList.add("hidden");
        document.body.classList.remove("modal-open");

        if (target === "login") {
            loginModal?.classList.remove("hidden");
            document.body.classList.add("modal-open");
        } else if (target === "signup") {
            signupModal?.classList.remove("hidden");
            document.body.classList.add("modal-open");
        } else if (target === "reset") {
            resetModal?.classList.remove("hidden");
            document.body.classList.add("modal-open");
        }
    };

    // Signup
    const signupForm = document.getElementById("signupForm");
    signupForm?.addEventListener("submit", async function (e) {
        e.preventDefault();
        const email = document.getElementById("signupEmail").value;

        try {
            const res = await fetch("/check-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });

            const data = await res.json();
            customAlert(data.success ? "Email found! Please check your inbox after clicking OK..." : data.message);
        } catch (err) {
            console.error(err);
            customAlert("Something went wrong.");
        }
    });

    // Reset Password
    const resetForm = document.getElementById("resetForm");
    resetForm?.addEventListener("submit", async function (e) {
        e.preventDefault();
        const email = document.getElementById("resetEmail").value;

        try {
            const res = await fetch("/reset-request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });

            const data = await res.json();
            customAlert(data.message);
        } catch (err) {
            console.error(err);
            customAlert("Something went wrong.");
        }
    });

    // Set Password
    if (window.showCreatePasswordModal && createPasswordModal) {
        createPasswordModal.classList.remove("hidden");
        document.body.classList.add("modal-open");
    }

    const createForm = document.getElementById("createPasswordForm");
    createForm?.addEventListener("submit", async function (e) {
        e.preventDefault();
        const password = document.getElementById("newPassword").value;
        const confirm = document.getElementById("confirmPassword").value;

        if (password !== confirm) return customAlert("Passwords do not match!");

        const minLength = 8;
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumbers = /\d/.test(password);
        const hasSymbols = /[!@#$%^&*(),.?":{}|<>]/.test(password);

        if (password.length < minLength || !hasUpperCase || !hasLowerCase || !hasNumbers || !hasSymbols) {
            return customAlert("Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one symbol.");
        }

        try {
            const res = await fetch("/set-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: window.emailToSetPassword, password }),
            });

            const data = await res.json();
            if (data.success) {
                customAlert("Password set! You can now log in.", "Success");
                createPasswordModal.classList.add("hidden");
                loginModal?.classList.remove("hidden");
                document.body.classList.remove("modal-open");
            } else {
                customAlert(data.message);
            }
        } catch (err) {
            console.error(err);
            customAlert("Error setting password.");
        }
    });

    // Login
    const loginForm = document.getElementById("loginForm");
    loginForm?.addEventListener("submit", async function (e) {
        e.preventDefault();

        const email = document.getElementById("loginEmail").value;
        const password = document.getElementById("loginPassword").value;

        try {
            const res = await fetch("/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json();
            if (data.success) {
                customAlert("Login successful!", "Success", () => {
                    document.getElementById("loginModal").style.display = "none";
                    document.body.classList.remove("modal-open");
                    window.history.replaceState({}, document.title, window.location.pathname);
                    window.location.reload(); 
                });
            } else {
                customAlert(data.message || "Invalid credentials.");
            }
        } catch (err) {
            console.error(err);
            customAlert("Login failed. Try again later.");
        }
    });

    // Create Post (submit body)
    const createPostForm = document.getElementById("createPostForm");
    const postContent = document.getElementById("postContent");
    const hiddenBodyInput = document.getElementById("hiddenBodyInput");

    if (createPostForm && postContent && hiddenBodyInput) {
        createPostForm.addEventListener("submit", function (e) {

            const content = postContent.innerHTML.trim();
            const textContent = postContent.textContent.trim();

            if (textContent.length === 0) {
                window.customAlert('The post body cannot be empty.', 'Error');
                e.preventDefault(); // Stop the form submission
                return; // Exit the function
            }
            
            hiddenBodyInput.value = postContent.innerHTML.trim();

            const pollQuestionInput = document.querySelector('input[name="pollQuestion"]');
            const pollOptionsInputs = document.querySelectorAll('input[name="pollOptions[]"]');

            if (pollQuestionInput && pollQuestionInput.value.trim() !== '') {
                // If a poll question is present, validate the number of options
                const filledOptions = Array.from(pollOptionsInputs).filter(input => input.value.trim() !== '');
                if (filledOptions.length < 2) {
                    customAlert('Please provide at least two poll options.');
                    e.preventDefault(); // Stop the form submission
                }
            }
        });
    }

    // Media Preview
    const imageInput = document.getElementById("imageInput");
    const previewContainer = document.getElementById("previewContainer");

    if (imageInput && previewContainer) {
        let selectedFiles = [];
        imageInput.addEventListener("change", function () {
            const newFiles = Array.from(imageInput.files);
            selectedFiles = selectedFiles.concat(newFiles);

            const dataTransfer = new DataTransfer();
            selectedFiles.forEach(file => dataTransfer.items.add(file));
            imageInput.files = dataTransfer.files;

            renderPreviews();
        });

        function renderPreviews() {
            previewContainer.innerHTML = "";
            selectedFiles.forEach((file, index) => {
                const fileURL = URL.createObjectURL(file);
                const wrapper = document.createElement("div");
                wrapper.classList.add("preview-item");

                const fileName = document.createElement("div");
                fileName.classList.add("file-name");
                fileName.textContent = file.name;
                fileName.title = file.name;

                const removeBtn = document.createElement("button");
                removeBtn.textContent = "✖";
                removeBtn.classList.add("preview-remove");
                removeBtn.onclick = function () {
                    selectedFiles.splice(index, 1);
                    const dataTransfer = new DataTransfer();
                    selectedFiles.forEach(f => dataTransfer.items.add(f));
                    imageInput.files = dataTransfer.files;
                    renderPreviews();
                };

                const preview = file.type.startsWith("video")
                    ? document.createElement("video")
                    : document.createElement("img");
                preview.src = fileURL;
                if (file.type.startsWith("video")) preview.controls = true;

                wrapper.appendChild(preview);
                wrapper.appendChild(removeBtn);
                wrapper.appendChild(fileName);
                previewContainer.appendChild(wrapper);
            });
        }
    }

    const commentMediaInput = document.getElementById("commentMediaInput");
    const commentMediaPreviewContainer = document.getElementById("commentMediaPreviewContainer");

    if (commentMediaInput && commentMediaPreviewContainer) {
        commentMediaInput.addEventListener("change", function () {
            commentMediaPreviewContainer.innerHTML = "";
            const file = this.files[0];
            if (file) {
                const fileURL = URL.createObjectURL(file);
                const wrapper = document.createElement("div");
                wrapper.classList.add("comment-preview-item");

                const fileName = document.createElement("div");
                fileName.classList.add("file-name");
                fileName.textContent = file.name;
                fileName.title = file.name;

                const removeBtn = document.createElement("button");
                removeBtn.textContent = "x";
                removeBtn.classList.add("comment-preview-remove");
                removeBtn.onclick = function () {
                    commentMediaInput.value = '';
                    commentMediaPreviewContainer.innerHTML = '';
                };

                const previewElement = file.type.startsWith("video")
                    ? document.createElement("video")
                    : document.createElement("img");
                previewElement.src = fileURL;
                if (file.type.startsWith("video")) previewElement.controls = true;

                wrapper.appendChild(previewElement);
                wrapper.appendChild(removeBtn);
                wrapper.appendChild(fileName);
                commentMediaPreviewContainer.appendChild(wrapper);
            }
        });
    }

    document.addEventListener('change', function (e) {
        const replyMediaInput = e.target.closest('input[id^="replyMediaInput-"]');
        if (replyMediaInput) {
            const commentId = replyMediaInput.id.replace('replyMediaInput-', '');
            const replyMediaPreviewContainer = document.getElementById(`replyMediaPreview-${commentId}`);

            if (replyMediaPreviewContainer) {
                replyMediaPreviewContainer.innerHTML = '';
                const file = replyMediaInput.files[0];
                if (file) {
                    const fileURL = URL.createObjectURL(file);
                    const wrapper = document.createElement("div");
                    wrapper.classList.add("comment-preview-item");

                    const fileName = document.createElement("div");
                    fileName.classList.add("file-name");
                    fileName.textContent = file.name;
                    fileName.title = file.name;

                    const removeBtn = document.createElement("button");
                    removeBtn.textContent = "x";
                    removeBtn.classList.add("comment-preview-remove");
                    removeBtn.onclick = function () {
                        replyMediaInput.value = '';
                        replyMediaPreviewContainer.innerHTML = '';
                    };

                    const previewElement = file.type.startsWith("video")
                        ? document.createElement("video")
                        : document.createElement("img");
                previewElement.src = fileURL;
                if (file.type.startsWith("video")) previewElement.controls = true;

                wrapper.appendChild(previewElement);
                wrapper.appendChild(removeBtn);
                wrapper.appendChild(fileName);
                replyMediaPreviewContainer.appendChild(wrapper);
            }
        }
    }
    });

    //Toolbar Formatting
    const toolbarButtons = document.querySelectorAll(".toolbar button");

    window.formatText = function (command) {
        postContent?.focus();
        document.execCommand(command);

        toolbarButtons.forEach(btn => {
            const cmd = btn.getAttribute("onclick")?.match(/'(.*?)'/)?.[1];
            if (cmd === command) btn.classList.toggle("active");
        });
    };

    // Avatar Logic
    const menu = document.getElementById('profileMenu');
    let cropper;
    const avatarInput = document.getElementById('avatarInput');
    const previewImg = document.getElementById('cropPreview');
    const avatarOverlay = document.getElementById('avatarPreviewOverlay');
    const menuDot = document.getElementById('menuDot');
    const optionsMenu = document.getElementById('avatarOptions');
    const zoomedAvatar = document.getElementById('zoomedAvatar');

    // Open profile menu
    window.openAvatarPreview = function () {
        avatarOverlay.classList.remove('hidden');
        optionsMenu.classList.add('hidden');
    };

    // Remove avatar
    window.removeAvatar = async function () {
        if (confirm("Are you sure you want to remove your avatar?")) {
            const res = await fetch('/profile/remove-avatar', { method: 'POST' });
            if (res.ok) {
                customAlert('Avatar removed successfully!', 'Success', () => {
                    window.location.reload();
                });
            } else {
                const data = await res.json().catch(() => ({ error: 'Failed to parse server response' }));
                customAlert(data.error || "Failed to remove avatar.");
            }
        }
    }

    avatarInput?.addEventListener('change', function () {
        const file = this.files[0];
        if (!file) return;

        document.getElementById('avatarPreviewOverlay')?.classList.add('hidden');
        document.getElementById('avatarOptions')?.classList.add('hidden');
        document.getElementById('profileMenu')?.classList.add('hidden');
        document.getElementById('profileAvatar')?.classList.remove('zoomed');

        const reader = new FileReader();
        reader.onload = function (e) {
            previewImg.src = e.target.result;
            document.getElementById('cropModal').classList.remove('hidden');
            if (cropper) cropper.destroy();
            cropper = new Cropper(previewImg, {
                aspectRatio: 1,
                viewMode: 1,
                dragMode: 'move',
                guides: false,
                movable: true,
                rotatable: false,
                scalable: false,
                zoomable: true,
                background: false,
                cropBoxResizable: true,
                cropBoxMovable: true
            });
        };
        reader.readAsDataURL(file);
    });

    document.getElementById('saveCropBtn')?.addEventListener('click', function () {
        const canvas = cropper.getCroppedCanvas({ width: 300, height: 300 });
        canvas.toBlob(function (blob) {
            const formData = new FormData();
            formData.append('avatar', blob, 'avatar.png');

            fetch('/profile/upload-avatar', {
                method: 'POST',
                body: formData
            })
            .then(async res => {
                const data = await res.json();
                if (res.ok) {
                    customAlert('Avatar uploaded successfully!', 'Success', () => {
                        window.location.reload();
                    });
                } else {
                    customAlert(data.error || "Failed to upload avatar.");
                }
            })
            .catch(err => {
                console.error(err);
                customAlert("An unexpected error occurred during upload.");
            });
        });
    });

    avatarOverlay?.addEventListener('click', function (e) {
        if (!e.target.closest('.avatar-preview-content')) {
            avatarOverlay.classList.add('hidden');
            optionsMenu.classList.add('hidden');
        }
    });

    menuDot?.addEventListener('click', function (e) {
        e.stopPropagation();
        optionsMenu.classList.toggle('hidden');
    });

    document.getElementById('cancelCropBtn')?.addEventListener('click', function () {
        document.getElementById('cropModal').classList.add('hidden');
        if (cropper) cropper.destroy();
        previewImg.src = '';
    });

    // Banner logic
    let bannerCropper;
    const bannerInput = document.getElementById('bannerInput');
    const bannerPreviewImg = document.getElementById('bannerCropPreview');
    const bannerOverlay = document.getElementById('bannerPreviewOverlay');
    const bannerMenuDot = document.getElementById('bannerMenuDot');
    const bannerOptions = document.getElementById('bannerOptions');

    window.openBannerPreview = function () {
        bannerOverlay.classList.remove('hidden');
        bannerOptions.classList.add('hidden');
    };

    window.removeBanner = async function () {
        if (confirm("Are you sure you want to remove your banner?")) {
            const res = await fetch('/profile/remove-banner', { method: 'POST' });
            if (res.ok) {
                customAlert('Banner removed successfully!', 'Success', () => {
                    window.location.reload();
                });
            } else {
                const data = await res.json().catch(() => ({ error: 'Failed to parse server response' }));
                customAlert(data.error || "Failed to remove banner.");
            }
        }
    }

    bannerInput?.addEventListener('change', function () {
        const file = this.files[0];
        if (!file) return;

        bannerOverlay?.classList.add('hidden');
        bannerOptions?.classList.add('hidden');

        const reader = new FileReader();
        reader.onload = function (e) {
            bannerPreviewImg.src = e.target.result;
            document.getElementById('bannerCropModal').classList.remove('hidden');
            if (bannerCropper) bannerCropper.destroy();
            bannerCropper = new Cropper(bannerPreviewImg, {
                aspectRatio: 3,
                viewMode: 1,
                dragMode: 'move',
                background: false
            });
        };
        reader.readAsDataURL(file);
    });

    document.getElementById('saveBannerCropBtn')?.addEventListener('click', function () {
        const canvas = bannerCropper.getCroppedCanvas({ width: 900, height: 300 });
        canvas.toBlob(function (blob) {
            const formData = new FormData();
            formData.append('banner', blob, 'banner.png');

            fetch('/profile/upload-banner', {
                method: 'POST',
                body: formData
            })
            .then(async res => {
                const data = await res.json();
                if (res.ok) {
                    customAlert('Banner uploaded successfully!', 'Success', () => {
                        window.location.reload();
                    });
                } else {
                    customAlert(data.error || "Failed to upload banner.");
                }
            })
            .catch(err => {
                console.error(err);
                customAlert("An unexpected error occurred during upload.");
            });
        });
    });

    bannerOverlay?.addEventListener('click', function (e) {
        if (!e.target.closest('.avatar-preview-content')) {
            bannerOverlay.classList.add('hidden');
            bannerOptions.classList.add('hidden');
        }
    });

    bannerMenuDot?.addEventListener('click', function (e) {
        e.stopPropagation();
        bannerOptions.classList.toggle('hidden');
    });

    document.getElementById('cancelBannerCropBtn')?.addEventListener('click', function () {
        document.getElementById('bannerCropModal').classList.add('hidden');
        if (bannerCropper) bannerCropper.destroy();
        bannerPreviewImg.src = '';
    });

    // Community Logic
    let communityCropper;
    const communityIconInput = document.getElementById('communityIconInput');
    const communityCropModal = document.getElementById('communityCropModal');
    const communityCropPreview = document.getElementById('communityCropPreview');
    const communityOverlay = document.getElementById('communityIconPreviewOverlay');
    const communityMenuDot = document.getElementById('communityMenuDot');
    const communityOptions = document.getElementById('communityOptions');

    window.openCommunityIconPreview = function () {
        communityOverlay.classList.remove('hidden');
        communityOptions?.classList.add('hidden');
    };

    communityOverlay?.addEventListener('click', (e) => {
        if (!e.target.closest('.avatar-preview-content')) {
            communityOverlay.classList.add('hidden');
            communityOptions?.classList.add('hidden');
        }
    });

    communityMenuDot?.addEventListener('click', (e) => {
        e.stopPropagation();
        communityOptions.classList.toggle('hidden');
    });

    document.addEventListener('click', function (e) {
        if (communityOptions && !communityOptions.classList.contains('hidden')) {
            if (!communityOptions.contains(e.target) && !communityMenuDot.contains(e.target)) {
                communityOptions.classList.add('hidden');
            }
        }
    });

    communityIconInput?.addEventListener('change', function () {
        const file = this.files[0];
        if (!file) return;
        communityOptions?.classList.add('hidden');
        communityOverlay.classList.add('hidden');
        const reader = new FileReader();
        reader.onload = function (e) {
            communityCropPreview.src = e.target.result;
            communityCropModal.classList.remove('hidden');
            if (communityOptions) {
                communityOptions.classList.add('hidden');
                communityOptions.style.display = 'none';
            }
            if (communityCropper) communityCropper.destroy();
            communityCropper = new Cropper(communityCropPreview, { 
                aspectRatio: 1,
                viewMode: 1,
                dragMode: 'move',
                background: false,
                guides: false
            });
        };
        reader.readAsDataURL(file);
    });

    document.getElementById('saveCommunityCropBtn')?.addEventListener('click', () => {
        const canvas = communityCropper.getCroppedCanvas({ width: 300, height: 300 });
        canvas.toBlob(function (blob) {
            const formData = new FormData();
            formData.append('icon', blob, 'icon.png');
            const communityName = window.location.pathname.split('/')[2];
            fetch(`/community/${communityName}/icon`, {
                method: 'POST',
                body: formData
            })
            .then(async res => {
                const data = await res.json();
                if (res.ok) {
                    customAlert(data.message || 'Icon uploaded successfully!', 'Success', () => {
                        location.reload();
                    });
                } else {
                    customAlert(data.error || "Upload failed", "Error");
                }
            })
            .catch(err => {
                console.error(err);
                customAlert("An unexpected error occurred during upload.");
            });
        });
    });

    document.getElementById('communityOptions')?.addEventListener('click', async function (e) {
        const deleteForm = e.target.closest('form[action$="/icon/delete"]');
        const deleteButton = e.target.closest('button[type="submit"]');

        if (deleteForm && deleteButton) {
            e.preventDefault(); // Prevent default form submission

            const communityName = window.location.pathname.split('/')[2];
            const confirmed = confirm('Are you sure you want to remove the community icon?');
            if (!confirmed) return;

            try {
                const res = await fetch(deleteForm.action, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                });
                const data = await res.json();

                if (res.ok) {
                    customAlert(data.message || 'Icon removed successfully!', 'Success', () => {
                        location.reload();
                    });
                } else {
                    customAlert(data.error || 'Failed to remove icon.', 'Error');
                }
            } catch (err) {
                console.error('Community icon removal failed:', err);
                customAlert('An unexpected error occurred during removal.', "Error");
            }
        }
    });

    document.getElementById('cancelCommunityCropBtn')?.addEventListener('click', () => {
        communityCropModal.classList.add('hidden');
        communityCropper?.destroy();
        communityCropPreview.src = '';
    });

    // Post comments/votes/etc
    const replyButtons = document.querySelectorAll('.reply-btn');
    replyButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const commentId = btn.getAttribute('data-comment-id');
            const form = document.getElementById(`replyForm-${commentId}`);
            if (form) form.classList.toggle('hidden');
        });
    });

    document.querySelectorAll('.open-emoji-picker').forEach(button => {
        button.addEventListener('click', () => {
            const postId = button.dataset.postId;
            const picker = document.getElementById(`emoji-picker-${postId}`);
            document.querySelectorAll('.emoji-picker').forEach(p => {
                if (p !== picker) p.classList.add('hidden');
            });
            picker.classList.toggle('hidden');
        });
    });

    document.querySelectorAll('.emoji-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const postId = btn.dataset.postId;
            const emoji = btn.dataset.emoji;
            const communityName = btn.dataset.communityName;
            try {
                const res = await fetch(`/community/${communityName}/reaction/${postId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ emoji })
                });

                if (res.ok) {
                    const data = await res.json();
                    // Call the new function to dynamically update the reactions on the page.
                    renderReactions(postId, data.reactions, data.userEmail);
                    // Hide the emoji picker modal
                    document.getElementById(`emoji-picker-${postId}`)?.classList.add('hidden');
                } else {
                    const data = await res.json();
                    customAlert(data.error || "Failed to add reaction.");
                }
            } catch (err) { console.error('Emoji react failed:', err); }
        });
    });

    // New function to handle the dynamic update of the reaction UI.
    function renderReactions(postId, reactions, userEmail) {
        const postElement = document.getElementById(`post-${postId}`); // Assume each post has an ID
        if (!postElement) return;

        const reactionBar = postElement.querySelector('.post-reactions');
        if (!reactionBar) return;

        // Clear existing reactions
        reactionBar.innerHTML = '';

        // Sort reactions by count
        const topReactions = Object.entries(reactions || {})
            .filter(([emoji, users]) => users.length > 0)
            .sort((a, b) => b[1].length - a[1].length)
            .slice(0, 3);

        // Render the top 3 reactions
        topReactions.forEach(([emoji, users]) => {
            const userReacted = users.includes(userEmail);
            
            // Create a button element instead of a div
            const reactionButton = document.createElement('button');
            reactionButton.classList.add('reaction-emoji');
            
            if (userReacted) {
                reactionButton.classList.add('highlight');
            }
            
            // Add all required data attributes for the event listener
            reactionButton.dataset.postId = postId;
            reactionButton.dataset.communityName = postElement.querySelector('.community-link').href.split('/').pop();
            reactionButton.dataset.emoji = emoji;

            reactionButton.innerHTML = `${emoji} ${users.length}`;
            reactionBar.appendChild(reactionButton);
        });

        // Update the selected state of the buttons in the picker
        const emojiPicker = document.getElementById(`emoji-picker-${postId}`);
        if (emojiPicker) {
            emojiPicker.querySelectorAll('.emoji-btn').forEach(btn => {
                const emoji = btn.dataset.emoji;
                if (reactions[emoji]?.includes(userEmail)) {
                    btn.classList.add('selected');
                } else {
                    btn.classList.remove('selected');
                }
            });
        }
    }

    document.querySelectorAll('.vote-btn').forEach(button => {
        button.addEventListener('click', async () => {
            const postId = button.dataset.id;
            const voteType = button.dataset.vote;
            const communityName = button.dataset.communityName; // Get from data attribute
            try {
                const res = await fetch(`/community/${communityName}/vote/${postId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ voteType })
                });
                const data = await res.json();
                if (data.upvotes !== undefined && data.downvotes !== undefined) {
                    const parent = button.closest('.post-actions');
                    parent.querySelector('.upvote-count').innerText = data.upvotes;
                    parent.querySelector('.downvote-count').innerText = data.downvotes;
                    parent.querySelector('.upvote').classList.toggle('active', data.userVote.up);
                    parent.querySelector('.downvote').classList.toggle('active', data.userVote.down);
                }
            } catch (err) { console.error('Vote failed:', err); }
        });
    });

    document.addEventListener('click', async (e) => {
        const button = e.target.closest('.reaction-emoji');
        if (!button) return;

        const postId = button.dataset.postId;
        const communityName = button.dataset.communityName;
        const emoji = button.dataset.emoji;

        try {
            const res = await fetch(`/community/${communityName}/reaction/${postId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emoji })
            });

            if (res.ok) {
                const data = await res.json();
                renderReactions(postId, data.reactions, data.userEmail);
            } else {
                const data = await res.json();
                customAlert(data.error || "Failed to add reaction.");
            }
        } catch (err) {
            console.error('Emoji react failed:', err);
        }
    });

    // Add new event listener for comment votes
    document.addEventListener('click', async (e) => {
        const button = e.target.closest('.upvote-comment, .downvote-comment');
        if (!button) return;

        const postId = button.dataset.postId;
        const commentId = button.dataset.commentId;
        const voteType = button.dataset.vote;
        const communityName = button.dataset.communityName;

        try {
            const res = await fetch(`/community/${communityName}/post/${postId}/comment/${commentId}/vote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ voteType })
            });
            const data = await res.json();
            if (data.upvotes !== undefined && data.downvotes !== undefined) {
                const parent = button.closest('.comment-actions');
                parent.querySelector('.upvote-count-comment').innerText = data.upvotes;
                parent.querySelector('.downvote-count-comment').innerText = data.downvotes;
                parent.querySelector('.upvote-comment').classList.toggle('active', data.userVote.up);
                parent.querySelector('.downvote-comment').classList.toggle('active', data.userVote.down);
            }
        } catch (err) {
            console.error('Comment vote failed:', err);
        }
    });

    window.confirmModeratorDelete = function (form) {
        const reason = prompt("Please enter reason for deleting this post:");
        if (!reason) return false;
        form.querySelector('input[name="reason"]').value = reason;
        return true;
    }


    function formatText(command) { document.execCommand(command, false, null); }
    function syncEditor() { document.getElementById('hiddenPostBody').value = document.getElementById('postEditor').innerHTML; }

    function timeAgo(timestamp) {
        const now = new Date();
        const created = new Date(timestamp);
        const diff = Math.floor((now - created) / 1000);

        if (diff < 60) return `${diff}s ago`;
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
        return `${Math.floor(diff / 604800)}w ago`;
    }

    document.querySelectorAll('.post-time, .comment-time').forEach(el => {
        const rawTime = el.getAttribute('data-created-at');
        if (rawTime) el.textContent = timeAgo(rawTime);
    });

    document.querySelectorAll('.join-form').forEach(form => {
        form.addEventListener('submit', function (e) {
            const isMember = form.dataset.isMember === 'true';
            if (isMember && !confirm("Are you sure you want to leave this community?")) {
                e.preventDefault();
            }
        });
    });

    const editBtn = document.getElementById("editBtn");
    const saveCancelBtns = document.getElementById("saveCancelBtns");
    const passwordEditFields = document.getElementById("password-edit-fields");
    const themeSelect = document.getElementById("theme-select");
    const cancelBtn = document.getElementById("cancelBtn");
    const settingsForm = document.getElementById("settings-form");
    const saveBtn = document.getElementById("saveBtn");

    // Store the initial theme value
    let initialTheme = themeSelect?.value;

    if (editBtn && saveCancelBtns && passwordEditFields && themeSelect && cancelBtn) {
        editBtn.addEventListener("click", function (e) {
            e.preventDefault();
            editBtn.style.display = "none";
            saveCancelBtns.style.display = "flex";
            passwordEditFields.style.display = "block";
            themeSelect.disabled = false;
        });

        if (saveBtn) {
            saveBtn.addEventListener("click", async function (e) {
                e.preventDefault();

                const currentPasswordInput = document.querySelector('input[name="currentPassword"]');
                const newPasswordInput = document.querySelector('input[name="newPassword"]');
                const confirmPasswordInput = document.querySelector('input[name="confirmPassword"]');
                const themeSelect = document.getElementById("theme-select"); // Get theme select

                const newPassword = newPasswordInput.value;
                const confirmPassword = confirmPasswordInput.value;
                const currentPassword = currentPasswordInput.value;
                const theme = themeSelect.value;
                
                // Client-side password validation
                if (newPassword && newPassword !== confirmPassword) {
                    return customAlert("New passwords do not match");
                }
                
                let isPasswordChange = false;

                if (newPassword) {
                    isPasswordChange = true;
                    if (!currentPassword) {
                        return customAlert("Current password is required to change password.");
                    }
                    // Client-side password strength validation
                    const minLength = 8;
                    const hasUpperCase = /[A-Z]/.test(newPassword);
                    const hasLowerCase = /[a-z]/.test(newPassword);
                    const hasNumbers = /\d/.test(newPassword);
                    const hasSymbols = /[!@#$%^&*(),.?":{}|<>]/.test(newPassword);

                    if (newPassword.length < minLength || !hasUpperCase || !hasLowerCase || !hasNumbers || !hasSymbols) {
                        return customAlert("Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one symbol.");
                    }
                }
                
                // Convert to AJAX submission
                try {
                    const res = await fetch("/profile/settings", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ 
                            currentPassword: isPasswordChange ? currentPassword : undefined,
                            newPassword: isPasswordChange ? newPassword : undefined,
                            confirmPassword: isPasswordChange ? confirmPassword : undefined,
                            theme
                        }),
                    });
                    
                    const data = await res.json();

                    if (res.ok) {
                        customAlert(data.message || "Settings saved successfully!", "Success", () => {
                            setTimeout(() => window.location.reload(), 500);
                        });
                    } else {
                        customAlert(data.error || "Failed to save settings.", "Error");
                    }
                } catch (err) {
                    console.error('Settings update failed:', err);
                    customAlert('An unexpected error occurred while saving settings.', "Error");
                }
            });
        }

        cancelBtn.addEventListener("click", function () {
            // Reset the state
            editBtn.style.display = "block";
            saveCancelBtns.style.display = "none";
            passwordEditFields.style.display = "none";
            themeSelect.disabled = true;
            settingsForm.reset();
            // Revert to the initial theme
            document.body.classList.remove('dark-mode');
            if (initialTheme === 'dark') {
                document.body.classList.add('dark-mode');
            }
            themeSelect.value = initialTheme;
        });
    }

    // Dynamic theme change for a better UI experience on the settings page
    if (themeSelect) {
        themeSelect.addEventListener('change', function () {
            const isDarkMode = this.value === 'dark';
            if (isDarkMode) {
                document.body.classList.add('dark-mode');
            } else {
                document.body.classList.remove('dark-mode');
            }

            // Dynamically update navbar image sources for both logos
            const navbarLogos = document.querySelectorAll('.navbar .logo-area img');
            const searchIcon = document.querySelector('.search-bar button img');
            const createPostIcon = document.querySelector('.nav-actions a img');
            const notificationIcon = document.querySelector('.nav-actions button img');

            if (navbarLogos[0]) {
                navbarLogos[0].src = isDarkMode ? '/img/forum/logo2-dark.png' : '/img/forum/logo2.png';
            }
            if (navbarLogos[1]) {
                navbarLogos[1].src = isDarkMode ? '/img/forum/logo-dark.png' : '/img/forum/logo.png';
            }
            if (searchIcon) {
                searchIcon.src = isDarkMode ? '/img/forum/search-dark.png' : '/img/forum/search.png';
            }
            if (createPostIcon) {
                createPostIcon.src = isDarkMode ? '/img/forum/create-post-dark.png' : '/img/forum/create-post.png';
            }
            if (notificationIcon) {
                notificationIcon.src = isDarkMode ? '/img/forum/notification-dark.png' : '/img/forum/notification.png';
            }
        });
    }

    (function () {
    function initKarma() {
        const badge = document.getElementById('karmaBadge');
        if (!badge) return;
        fetch('/api/me/karma', { credentials: 'same-origin' })
            .then(async r => {
                if (!r.ok) {
                    // Try to read JSON error if available, display custom alert for server-side error
                    const errorData = await r.json().catch(() => ({ error: 'Server error' }));
                    window.customAlert(errorData.error || 'Failed to fetch karma score.', 'Error');
                    return null;
                }
                return r.json();
            })
            .then(data => {
                if (data?.success) badge.textContent = data.karma;
            })
            .catch(err => { 
                console.error('Unexpected karma fetch error:', err); 
                // This catch handles network errors
                window.customAlert('An unexpected error occurred while fetching karma.', 'Error');
            });
    }
    document.addEventListener('DOMContentLoaded', initKarma);
})();

    // Community member management
    const actionSelect = document.getElementById('actionSelect');
    const memberTableBody = document.getElementById('memberTableBody');
    const memberSearchInput = document.getElementById('memberSearchInput');
    const saveMembersBtn = document.getElementById('saveMembersBtn');
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    const communityName = window.location.pathname.split('/')[2];

    let currentMembers = [];

    async function fetchAndRenderMembers(action) {
        const isGeneralCommunity = document.getElementById('actionSelect')?.closest('.settings-page')?.querySelector('.community-buttons')?.querySelector('.join-form')?.dataset.isMember === undefined && document.getElementById('actionSelect')?.closest('.settings-page')?.querySelector('.member-count') === null;

        if (isGeneralCommunity && (action === 'remove' || action === 'add')) {
            memberTableBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">Cannot perform this action on a General Community.</td></tr>';
            saveMembersBtn.classList.add('hidden');
            customAlert("Cannot manage members of a General Community.", "VisionSphere Alert");
            return;
        }

        memberSearchInput.value = '';
        selectAllCheckbox.checked = false;
        saveMembersBtn.classList.add('hidden');
        memberTableBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">Loading...</td></tr>';

        let url;
        if (action === 'add') {
            url = `/community/${communityName}/non-members`;
        } else if (action === 'unban') {
            url = `/community/${communityName}/banned-members`;
        } else { // 'remove' or 'ban'
            url = `/community/${communityName}/members`;
        }

        try {
            const res = await fetch(url);
            const data = await res.json();

            if (data.success) {
                currentMembers = data.members || data.nonMembers || data.bannedMembers;
                renderTable(currentMembers, action);
            } else {
                memberTableBody.innerHTML = `<tr><td colspan="3" style="text-align: center;">${data.error || 'Failed to load members.'}</td></tr>`;
                customAlert(data.error || 'Failed to load members.');
            }
        } catch (err) {
            console.error('Failed to fetch members:', err);
            memberTableBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">Server error.</td></tr>';
            customAlert('Server error while trying to fetch members.');
        }
    }

    function renderTable(members, action) {
        memberTableBody.innerHTML = '';
        if (members.length === 0) {
            memberTableBody.innerHTML = '<tr><td colspan="3" style="text-align: center;">No users found for this action.</td></tr>';
            return;
        }

        members.forEach(member => {
            const tr = document.createElement('tr');
            tr.dataset.email = member.email;

            let nameCellContent;
            let reasonCellContent;

            if (action === 'unban') {
                nameCellContent = `<span class="member-info-name">${member.fullName}</span><br><span class="member-info-details">${member.email} (${member.id})</span>`;
                reasonCellContent = `<span class="unrequired-reason">Reason is not required for this action.</span>`;
            } else {
                const id = member.id;
                nameCellContent = `<span class="member-info-name">${member.fullName}</span><br><span class="member-info-details">${member.email} (${id})</span>`;
                if (action === 'remove' || action === 'ban') {
                    reasonCellContent = `<textarea class="reason-input" placeholder="Enter reason..." rows="1"></textarea>`;
                } else { // 'add'
                    reasonCellContent = `<span class="unrequired-reason">Reason is not required for this action.</span>`;
                }
            }

            tr.innerHTML = `
            <td><input type="checkbox" class="member-checkbox" data-email="${member.email}" /></td>
            <td>${nameCellContent}</td>
            <td class="reason-cell">${reasonCellContent}</td>`;
            memberTableBody.appendChild(tr);
        });
        saveMembersBtn.classList.remove('hidden');
    }

    actionSelect?.addEventListener('change', function () {
        const action = this.value;
        if (action) {
            saveMembersBtn.textContent = action.charAt(0).toUpperCase() + action.slice(1);
        } else {
             saveMembersBtn.textContent = 'Apply Action';
        }
        fetchAndRenderMembers(action);
    });

    memberSearchInput?.addEventListener('keyup', function () {
        const query = this.value.toLowerCase();
        const action = actionSelect.value;
        const filtered = currentMembers.filter(member =>
            (member.fullName?.toLowerCase().includes(query)) ||
            (member.email?.toLowerCase().includes(query))
        );
        renderTable(filtered, action);
    });

    selectAllCheckbox?.addEventListener('change', function () {
        const isChecked = this.checked;
        document.querySelectorAll('.member-checkbox').forEach(checkbox => {
            checkbox.checked = isChecked;
        });
    });

    memberTableBody?.addEventListener('change', function (e) {
        if (e.target.classList.contains('member-checkbox')) {
            const allChecked = document.querySelectorAll('.member-checkbox:checked').length === document.querySelectorAll('.member-checkbox').length;
            selectAllCheckbox.checked = allChecked;
        }
    });

    saveMembersBtn?.addEventListener('click', async function () {
        const action = actionSelect.value;
        const selectedCheckboxes = document.querySelectorAll('.member-checkbox:checked');
        const emails = Array.from(selectedCheckboxes).map(cb => cb.dataset.email);

        if (emails.length === 0) {
            return customAlert('Please select at least one member.');
        }

        let reason = '';
        if (action === 'remove' || action === 'ban') {
            const reasons = {};
            let allReasonsProvided = true;
            emails.forEach(email => {
                const row = memberTableBody.querySelector(`tr[data-email="${email}"]`);
                const reasonInput = row.querySelector('.reason-input');
                if (reasonInput) {
                    const r = reasonInput.value.trim();
                    if (!r) {
                        allReasonsProvided = false;
                    }
                    reasons[email] = r;
                }
            });
            if (!allReasonsProvided) {
                return customAlert('Reason is required for all selected members.');
            }
            reason = reasons[emails[0]]; // Assuming a single reason for the bulk action API
        }

        const actionVerb = action === 'remove' ? 'remove' : action === 'ban' ? 'ban' : action === 'add' ? 'add' : 'unban';
        const confirmed = confirm(`Are you sure you want to ${actionVerb} ${emails.length} member(s)?`);
        if (!confirmed) return;

        const reloadCallback = (message) => {
            customAlert(message, "Success", () => {
                window.location.reload();
            });
        };

        if (action === 'remove') {
            const res = await fetch(`/community/${communityName}/kick-multiple`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emails, reason })
            });
            const data = await res.json();
            if (data.success) {
                reloadCallback(data.message);
            } else {
                customAlert(data.error, "Error");
            }
        } else if (action === 'ban') {
            const res = await fetch(`/community/${communityName}/ban`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emails, reason })
            });
            const data = await res.json();
            if (res.ok) {
                reloadCallback(data.message);
            } else {
                customAlert(data.error, "Error");
            }
        } else if (action === 'add') {
            const res = await fetch(`/community/${communityName}/add-members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emails })
            });
            const data = await res.json();
            if (res.ok) {
                reloadCallback(data.message);
            } else {
                customAlert(data.error, "Error");
            }
        } else if (action === 'unban') {
            const res = await fetch(`/community/${communityName}/unban`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emails })
            });
            const data = await res.json();
            if (res.ok) {
                reloadCallback(data.message);
            } else {
                customAlert(data.error, "Error");
            }
        }
    });

    const descriptionBox = document.getElementById('descriptionBox');
    const editableDescription = document.getElementById('editableDescription');
    const editDescriptionBtn = document.getElementById('editDescriptionBtn');
    const saveDescriptionBtn = document.getElementById('saveDescriptionBtn');
    const cancelDescriptionBtn = document.getElementById('cancelDescriptionBtn');

    if (descriptionBox && editableDescription && editDescriptionBtn && saveDescriptionBtn) {
        let originalDescription = editableDescription.innerText;

        editDescriptionBtn.addEventListener('click', () => {
            originalDescription = editableDescription.innerText;
            editableDescription.contentEditable = true;
            editableDescription.focus();
            editableDescription.classList.add('editing');
            editDescriptionBtn.classList.add('hidden');
            saveDescriptionBtn.classList.remove('hidden');
            cancelDescriptionBtn.classList.remove('hidden');
        });

        saveDescriptionBtn.addEventListener('click', async () => {
            const newDescription = editableDescription.innerText;
            const communityName = window.location.pathname.split('/')[2];

            try {
                const res = await fetch(`/community/${communityName}/description`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ description: newDescription })
                });

                if (res.ok) {
                    customAlert('Description updated successfully!', "Success");
                    editableDescription.contentEditable = false;
                    editableDescription.classList.remove('editing');
                    editDescriptionBtn.classList.remove('hidden');
                    saveDescriptionBtn.classList.add('hidden');
                    cancelDescriptionBtn.classList.add('hidden');
                    originalDescription = newDescription;
                } else {
                    const error = await res.text();
                    customAlert(`Failed to save description: ${error}`, "Error");
                }
            } catch (err) {
                console.error(err);
                customAlert('An error occurred while saving the description.', "Error");
            }
        });

        if (cancelDescriptionBtn) {
            cancelDescriptionBtn.addEventListener('click', () => {
                editableDescription.innerText = originalDescription;
                editableDescription.contentEditable = false;
                editableDescription.classList.remove('editing');
                editDescriptionBtn.classList.remove('hidden');
                saveDescriptionBtn.classList.add('hidden');
                cancelDescriptionBtn.classList.add('hidden');
            });
        }
    }


    // Confirmation prompt for moderator comment deletion
    window.confirmModeratorCommentDelete = function (form) {
        const reason = prompt("Please enter reason for deleting this comment:");
        if (!reason) return false;
        form.querySelector('input[name="reason"]').value = reason;
        return true;
    }

    window.deleteComment = function (communityName, postId, commentId) {
        if (confirm('Are you sure you want to delete this comment?')) {
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = `/community/${communityName}/post/${postId}/comment/${commentId}/delete`;
            document.body.appendChild(form);
            form.submit();
        }
    };

    document.querySelectorAll('.edit-comment-btn').forEach(button => {
        button.addEventListener('click', function (e) {
            e.preventDefault();
            const commentId = this.dataset.commentId;
            const commentItem = this.closest('.comment-item');
            const contentDiv = commentItem.querySelector(`#commentContent-${commentId}`);
            const editForm = commentItem.querySelector(`#editCommentForm-${commentId}`);

            contentDiv.style.display = 'none';
            editForm.style.display = 'block';

            // Hide the edit and delete buttons
            const editButton = commentItem.querySelector('.edit-comment-btn');
            const deleteForm = commentItem.querySelector(`form[action*="/comment/${commentId}/delete"]`);
            if (editButton) editButton.style.display = 'none';
            if (deleteForm) deleteForm.style.display = 'none';
        });
    });

    document.querySelectorAll('.cancel-edit-btn').forEach(button => {
        button.addEventListener('click', function (e) {
            e.preventDefault();
            const commentId = this.dataset.commentId;
            const commentItem = this.closest('.comment-item');
            const contentDiv = commentItem.querySelector(`#commentContent-${commentId}`);
            const editForm = commentItem.querySelector(`#editCommentForm-${commentId}`);

            editForm.style.display = 'none';
            contentDiv.style.display = 'block';

            // Show the edit and delete buttons again
            const editButton = commentItem.querySelector('.edit-comment-btn');
            const deleteForm = commentItem.querySelector(`form[action*="/comment/${commentId}/delete"]`);
            if (editButton) editButton.style.display = 'inline-block';
            if (deleteForm) deleteForm.style.display = 'inline';
        });
    });

    document.querySelectorAll('.edit-comment-form').forEach(form => {
        form.addEventListener('submit', async function (e) {
            e.preventDefault();
            const commentId = this.dataset.commentId;
            const content = this.querySelector('textarea').value;
            const communityName = window.location.pathname.split('/')[2];
            const postId = window.location.pathname.split('/')[4];
            const commentItem = this.closest('.comment-item');


            try {
                const res = await fetch(`/community/${communityName}/post/${postId}/comment/${commentId}/edit`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content })
                });

                if (res.ok) {
                    const contentDiv = document.getElementById(`commentContent-${commentId}`);
                    contentDiv.innerText = content;
                    contentDiv.style.display = 'block';
                    this.style.display = 'none';
                    const editButton = commentItem.querySelector('.edit-comment-btn');
                    const deleteForm = commentItem.querySelector(`form[action*="/comment/${commentId}/delete"]`);
                    if (editButton) editButton.style.display = 'inline-block';
                    if (deleteForm) deleteForm.style.display = 'inline';

                    window.customAlert('Comment edited successfully.', 'Success');
                } else {
                    const data = await res.json();
                    customAlert(`Failed to save comment: ${data.error}`, "Error");
                }
            } catch (err) {
                console.error('Comment edit failed:', err);
                customAlert('An error occurred while saving the comment.', "Error");
            }
        });
    });

    document.querySelectorAll(".share-btn").forEach((button) => {
        button.addEventListener("click", async (e) => {
            e.stopPropagation(); // Prevents the link wrapper from being clicked
            const communityName = button.dataset.communityName;
            const postId = button.dataset.postId;
            const url = `${window.location.origin}/community/${communityName}/post/${postId}`;

            try {
                await navigator.clipboard.writeText(url);
                customAlert("Link copied to clipboard!", "Success");
            } catch (err) {
                console.error("Failed to copy link:", err);
                customAlert("Failed to copy link. You can manually copy it from the address bar.", "Error");
            }
        });
    });

    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const body = document.body;

    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', () => {
            const body = document.body;
            body.classList.toggle('sidebar-open');

            const icon = sidebarToggleBtn.querySelector('i');
            if (icon) {
                // Toggles between the correct Font Awesome icon classes
                icon.classList.toggle('fa-angles-right');
                icon.classList.toggle('fa-angles-left');
            } else {
                // If the icon element is missing, recreate it and add it to the button.
                // This prevents the button from ever reverting to plain text.
                sidebarToggleBtn.textContent = ''; // Clear any existing text
                const newIcon = document.createElement('i');
                newIcon.classList.add('fas', body.classList.contains('sidebar-open') ? 'fa-angles-left' : 'fa-angles-right');
                sidebarToggleBtn.appendChild(newIcon);
            }
        });
    }

    // Notification modal
    const notificationBtn = document.getElementById('notificationBtn');
    const notificationModal = document.getElementById('notificationModal');
    const notificationList = document.getElementById('notificationList');
    const notificationBadge = document.querySelector('.notification-badge');

    if (notificationBtn) {
        notificationBtn.addEventListener('click', async () => {
            const isHidden = notificationModal.classList.contains('hidden');

            // Hide all other modals
            document.querySelectorAll('.modal-container').forEach(modal => {
                modal.classList.add('hidden');
            });

            if (isHidden) {
                // Show modal and fetch notifications
                notificationModal.classList.remove('hidden');
                notificationBtn.classList.add('active');

                try {
                    const res = await fetch('/notification/api');
                    const data = await res.json();

                    if (data.success) {
                        notificationList.innerHTML = ''; // Clear list
                        const unreadNotifications = data.notifications.filter(n => !n.read);

                        // Check if there are unread notifications and display a message if not
                        if (unreadNotifications.length === 0) {
                            const message = document.createElement('div');
                            message.classList.add('notification-message');
                            message.textContent = "You've read all notifications. Click view all to see past notifications.";
                            notificationList.appendChild(message);
                        } else {
                            // Display only unread notifications
                            unreadNotifications.forEach(n => {
                                const li = document.createElement('li');
                                li.classList.add('notification-item');
                                li.classList.add('unread');
                                li.innerHTML = `
                                    <span>${n.message}</span>
                                    <small>(${new Date(n.createdAt).toLocaleString()})</small>
                                `;
                                notificationList.appendChild(li);
                            });
                        }

                        // Mark as read after opening, only if there were unread notifications
                        if (unreadNotifications.length > 0) {
                            await fetch('/notification/mark-read', { method: 'POST' });
                            if (notificationBadge) notificationBadge.remove(); // Remove badge
                        }

                    } else {
                        notificationList.innerHTML = '<li>Failed to load notifications.</li>';
                        customAlert("Failed to load notifications.", "Error");
                    }
                } catch (err) {
                    console.error('Failed to fetch notifications:', err);
                    notificationList.innerHTML = '<li>Failed to load notifications.</li>';
                    customAlert("Failed to load notifications. Server error.", "Error");
                }
            } else {
                notificationModal.classList.add('hidden');
                notificationBtn.classList.remove('active');
            }
        });
    }

    // Hide modal if user clicks outside
    window.addEventListener('click', (e) => {
        if (!notificationModal?.contains(e.target) && !notificationBtn?.contains(e.target) && !customAlertModal?.contains(e.target)) {
            notificationModal?.classList.add('hidden');
            notificationBtn?.classList.remove('active');
        }
    });

    document.querySelectorAll('.post-actions-menu-dot').forEach(dot => {
        dot.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = dot.nextElementSibling;
            document.querySelectorAll('.post-options-dropdown').forEach(d => {
                if (d !== dropdown) {
                    d.style.display = 'none';
                }
            });
            dropdown.style.display = dropdown.style.display === 'flex' ? 'none' : 'flex';
        });
    });

    window.addEventListener('click', (e) => {
        document.querySelectorAll('.post-options-dropdown').forEach(dropdown => {
            if (!dropdown.contains(e.target) && !e.target.classList.contains('post-actions-menu-dot')) {
                dropdown.style.display = 'none';
            }
        });
    });

    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Deactivate all buttons and hide all content
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.add('hidden'));

            // Activate the clicked button and show the corresponding content
            const targetId = button.dataset.target;
            const targetContent = document.getElementById(targetId);
            button.classList.add('active');
            targetContent.classList.remove('hidden');
        });
    });

    // Live search
    const searchInput = document.getElementById('searchInput');
    const searchDropdown = document.getElementById('searchDropdown');
    const MIN_SEARCH_LENGTH = 1;
    let debounceTimeout;

    if (searchInput) {
        searchInput.addEventListener('input', function () {
            clearTimeout(debounceTimeout);
            const query = this.value.trim();
            if (query.length > MIN_SEARCH_LENGTH) {
                debounceTimeout = setTimeout(() => {
                    fetchLiveResults(query);
                }, 300); // 300ms debounce
            } else {
                searchDropdown.classList.add('hidden');
            }
        });

        document.addEventListener('click', function (event) {
            if (!searchInput.contains(event.target) && !searchDropdown.contains(event.target)) {
                searchDropdown.classList.add('hidden');
            }
        });
    }

    async function fetchLiveResults(query) {
        try {
            const res = await fetch(`/search/api/live?q=${encodeURIComponent(query)}`);
            const data = await res.json();
            renderLiveResults(data);
        } catch (err) {
            console.error('Live search failed:', err);
            searchDropdown.classList.add('hidden');
        }
    }

    function renderLiveResults(data) {
        searchDropdown.innerHTML = '';

        if (data.communities.length === 0 && data.posts.length === 0 && data.users.length === 0) {
            const noResults = document.createElement('li');
            noResults.classList.add('no-results');
            noResults.textContent = 'No results found.';
            searchDropdown.appendChild(noResults);
            searchDropdown.classList.remove('hidden');
            return;
        }

        // Render communities
        if (data.communities.length > 0) {
            const title = document.createElement('div');
            title.classList.add('search-section-title');
            title.textContent = 'Communities';
            searchDropdown.appendChild(title);
            const ul = document.createElement('ul');
            data.communities.forEach(c => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <a href="/community/${c.name}" class="community-card">
                        <img src="${c.icon?.filename ? '/uploads/communities/' + c.icon.filename : '/img/community/icon.png'}"
                            alt="${c.name} Icon" class="community-icon">
                        <span>c/${c.name}</span>
                    </a>
                `;
                ul.appendChild(li);
            });
            searchDropdown.appendChild(ul);
        }

        // Render posts
        if (data.posts.length > 0) {
            const title = document.createElement('div');
            title.classList.add('search-section-title');
            title.textContent = 'Posts';
            searchDropdown.appendChild(title);
            const ul = document.createElement('ul');
            data.posts.forEach(p => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <a href="/community/${p.community}/post/${p._id}" class="post-card">
                        <div class="post-title">${p.title}</div>
                        <small>in c/${p.community}</small>
                    </a>
                `;
                ul.appendChild(li);
            });
            searchDropdown.appendChild(ul);
        }

        // Render users
        if (data.users.length > 0) {
            const title = document.createElement('div');
            title.classList.add('search-section-title');
            title.textContent = 'Users';
            searchDropdown.appendChild(title);
            const ul = document.createElement('ul');
            data.users.forEach(u => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <a href="/profile/view/${u.email}" class="user-card">
                        <img src="${u.avatar?.filename || '/img/user/profile.png'}"
                            alt="${u.fullName} Avatar" class="post-avatar">
                        <span>${u.fullName}</span>
                    </a>
                `;
                ul.appendChild(li);
            });
            searchDropdown.appendChild(ul);
        }

        searchDropdown.classList.remove('hidden');
    }

    const addPollOptionBtn = document.getElementById("addPollOptionBtn");
    const pollOptionsContainer = document.getElementById("pollOptionsContainer");

    if (addPollOptionBtn && pollOptionsContainer) {
        let optionCount = 2; // Default start two options
        addPollOptionBtn.addEventListener("click", () => {
            optionCount++;
            const newOptionInput = document.createElement("input");
            newOptionInput.type = "text";
            newOptionInput.name = "pollOptions[]";
            newOptionInput.placeholder = `Option ${optionCount}`;
            pollOptionsContainer.appendChild(newOptionInput);
        });
    }

    // Event delegation for poll votes
    document.addEventListener('click', async (e) => {
        const button = e.target.closest('.poll-option-btn');
        if (!button) return;

        e.stopPropagation();

        const postId = button.dataset.postId;
        const postElement = button.closest('.post-poll');
        const communityName = postElement?.dataset.communityName;
        const optionIndex = button.dataset.optionId;

        if (!communityName || !postId) {
            console.error('Missing communityName or postId');
            customAlert('An error occurred. Missing post data.', "Error");
            return;
        }

        try {
            const res = await fetch(`/community/${communityName}/poll/${postId}/vote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ optionIndex })
            });
            const data = await res.json();
            if (res.ok) {
                renderPollUI(postId, data.poll, data.userEmail);
            } else {
                customAlert(data.error, "Error");
            }
        } catch (err) {
            console.error('Poll vote failed:', err);
            customAlert('An error occurred while trying to vote.', "Error");
        }
    });

    // Function to render the poll UI dynamically
    function renderPollUI(postId, pollData, userEmail) {
        const postElement = document.getElementById(`post-poll-${postId}`);
        if (!postElement) return;

        const pollOptionsDiv = postElement.querySelector('.poll-options');
        if (!pollOptionsDiv) return;

        const totalVotes = pollData.reduce((sum, option) => sum + option.votes, 0);

        // Clear existing options before re-rendering
        pollOptionsDiv.innerHTML = '';

        pollData.forEach((option, index) => {
            const userHasVoted = option.userHasVoted;
            const votePercentage = totalVotes > 0 ? ((option.votes / totalVotes) * 100).toFixed(0) : 0;

            const pollHtml = `
                <button class="poll-option-btn ${userHasVoted ? 'voted' : ''}"
                        data-post-id="${postId}"
                        data-option-id="${index}"
                        style="--progress: ${votePercentage}%;">
                    <span class="option-text">${option.text}</span>
                    <div class="poll-result-info">
                        <span class="vote-count">${option.votes} votes</span>
                        <span class="vote-percentage">(${votePercentage}%)</span>
                    </div>
                    <div class="poll-result-bar"></div>
                </button>
            `;
            pollOptionsDiv.innerHTML += pollHtml;
        });
    }

    document.querySelectorAll('.role-select').forEach(select => {
        select.addEventListener('change', async function () {
            const userEmail = this.dataset.userEmail;
            const action = this.value;
            const originalRole = this.dataset.originalRole;

            if (action === 'none') return; // Do nothing if the default option is selected

            if (action === 'remove') {
                const confirmed = confirm(`Are you sure you want to permanently remove user ${userEmail}? This action cannot be undone.`);
                if (!confirmed) {
                    this.value = 'none';
                    return;
                }

                try {
                    const res = await fetch('/management/remove-user', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: userEmail })
                    });
                    const data = await res.json();
                    if (data.success) {
                        // This causes a reload
                        customAlert(data.message, "Success", () => {
                            window.location.reload();
                        });
                    } else {
                        customAlert(data.error, "Error");
                        this.value = 'none';
                    }
                } catch (err) {
                    console.error('Failed to remove user:', err);
                    customAlert('An error occurred while trying to remove the user.', "Error");
                    this.value = 'none';
                }
            } else {
                // This handles promote and demote actions
                const newRole = action;
                const confirmed = confirm(`Are you sure you want to change the role of ${userEmail} from ${originalRole} to ${newRole}?`);
                if (!confirmed) {
                    this.value = originalRole;
                    return;
                }

                try {
                    const res = await fetch('/management/update-role', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: userEmail, newRole })
                    });
                    const data = await res.json();
                    if (data.success) {
                        // This causes a reload
                        customAlert(data.message, "Success", () => {
                            window.location.reload();
                        });
                    } else {
                        customAlert(data.error, "Error");
                        this.value = originalRole;
                    }
                } catch (err) {
                    console.error('Failed to update role:', err);
                    customAlert('An error occurred while updating the role.', "Error");
                    this.value = originalRole;
                }
            }
        });
    });

    const userSearchInput = document.getElementById('userSearchInput');
    const userTableBody = document.getElementById('userTable')?.querySelector('tbody');

    if (userSearchInput && userTableBody) {
        userSearchInput.addEventListener('keyup', function () {
            const query = userSearchInput.value.toLowerCase();
            const rows = userTableBody.querySelectorAll('tr');

            rows.forEach(row => {
                const fullName = row.cells[0]?.textContent.toLowerCase() || '';
                const email = row.cells[1]?.textContent.toLowerCase() || '';
                const userId = row.cells[2]?.textContent.toLowerCase() || '';

                if (fullName.includes(query) || email.includes(query) || userId.includes(query)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    }

    document.querySelectorAll('.remove-user-btn').forEach(button => {
        button.addEventListener('click', async function () {
            const userEmail = this.dataset.userEmail;
            const confirmed = confirm(`Are you sure you want to permanently remove user ${userEmail}? This action cannot be undone.`);

            if (confirmed) {
                try {
                    const res = await fetch('/management/remove-user', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email: userEmail })
                    });
                    const data = await res.json();
                    if (data.success) {
                        // This causes a reload
                        customAlert(data.message, "Success", () => {
                            window.location.reload();
                        });
                    } else {
                        customAlert(data.error, "Error");
                    }
                } catch (err) {
                    console.error('Failed to remove user:', err);
                    customAlert('An error occurred while trying to remove the user.', "Error");
                }
            }
        });
    });

    // Add user modal
    const addUserBtn = document.getElementById('addUserBtn');
    const addUserModal = document.getElementById('addUserModal');
    const addUserForm = document.getElementById('addUserForm');

    if (addUserBtn && addUserModal && addUserForm) {
        addUserBtn.addEventListener('click', () => {
            addUserModal.classList.remove('hidden');
        });

        addUserModal.addEventListener('click', (e) => {
            if (e.target === addUserModal) {
                addUserModal.classList.add('hidden');
                addUserForm.reset();
            }
        });

        addUserForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const fullName = document.getElementById('addFullName').value;
            const email = document.getElementById('addEmail').value;
            const id = document.getElementById('addId').value;
            const userType = document.getElementById('addUserType').value;

            const res = await fetch('/management/add-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fullName, email, id, userType })
            });

            const data = await res.json();

            if (data.success) {
                customAlert(data.message, "Success", () => {
                    window.location.reload();
                });
            } else {
                customAlert(data.error, "Error");
            }
        });
    }

    (function () {
        const form = document.getElementById("createCommunityForm");
        const content = document.getElementById("postContent");
        const hiddenInput = document.getElementById("hiddenBodyInput");
    
        if (form && content && hiddenInput) {
            form.addEventListener("submit", async function (e) {
                e.preventDefault(); 
    
                hiddenInput.value = content.innerHTML.trim();

                const name = document.getElementById("name").value.trim();
                const description = hiddenInput.value.trim();
    
                if (name.length === 0) {
                    return customAlert('Community name is required.', 'Error');
                }
                const strippedDescription = description.replace(/<[^>]*>/g, '').trim();
                if (strippedDescription.length === 0 || strippedDescription === 'No description yet.') {
                     return customAlert('A brief description is required.', 'Error');
                }
                
                try {
                    const formData = new FormData(this);
                    const data = {};
                    formData.forEach((value, key) => data[key] = value);
                    
                    const res = await fetch(this.action, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });
                    
                    if (res.redirected) {
                        window.customAlert('Community created successfully!', 'Success', () => {
                            setTimeout(() => window.location.href = res.url, 500);
                        });
                    } else {
                        const errorData = await res.json();
                        customAlert(errorData.error || "Failed to create community.", "Error");
                    }
    
                } catch (err) {
                    console.error(err);
                    customAlert('An unexpected error occurred during community creation.', "Error");
                }
            });
        }
    })();
    (function () {
        const deleteCommunityForm = document.getElementById('deleteCommunityForm');
    
        if (deleteCommunityForm) {
            deleteCommunityForm.addEventListener('submit', async function (e) {
                e.preventDefault(); 
    
                const communityName = this.dataset.communityName;
    
                const confirmed = confirm(`Are you sure you want to permanently delete the community "${communityName}"? This action cannot be undone.`);
                if (!confirmed) return;
    
                try {
                    const res = await fetch(this.action, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                    });
    
                    if (res.redirected) {
                        customAlert(`Community "${communityName}" deleted successfully.`, "Success", () => {
                            setTimeout(() => window.location.href = res.url, 500);
                        });
                    } else {
                        const data = await res.json();
                        customAlert(data.error || "Failed to delete community.", "Error");
                    }
                } catch (err) {
                    console.error('Community delete failed:', err);
                    customAlert('An unexpected error occurred during community deletion.', "Error");
                }
            });
        }
    })();

    // Media zoom for posts
    const genericMediaOverlay = document.getElementById('genericMediaOverlay');
    const mediaPreviewContent = genericMediaOverlay?.querySelector('.media-preview-content');

    // Function to open the generic media preview
    function openPostMediaPreview(mediaSource, isVideo = false) {
        if (!genericMediaOverlay || !mediaPreviewContent) return;

        // Clear previous content
        mediaPreviewContent.innerHTML = '';
        
        let mediaElement;
        if (isVideo) {
            mediaElement = document.createElement('video');
            mediaElement.setAttribute('controls', 'true');
            mediaElement.setAttribute('loop', 'true'); // optional
            mediaElement.style.maxHeight = '90vh';
            mediaElement.style.maxWidth = '90vw';
        } else {
            mediaElement = document.createElement('img');
        }
        
        mediaElement.src = mediaSource;
        mediaPreviewContent.appendChild(mediaElement);

        genericMediaOverlay.classList.remove('hidden');
        document.body.classList.add("modal-open");
    }

    // Add click listener to all post images and videos
    document.addEventListener('click', function (e) {
        const target = e.target;
        const isPostMedia = target.closest('.post-media') || target.closest('.post-detail-media');

        if (isPostMedia && (target.tagName === 'IMG' || target.tagName === 'VIDEO')) {
            e.preventDefault();
            const mediaSource = target.src || target.dataset.src; // Use src or data-src
            const isVideo = target.tagName === 'VIDEO';
            openPostMediaPreview(mediaSource, isVideo);
        }
    });

    // Close generic media overlay on outside click
    genericMediaOverlay?.addEventListener('click', function (e) {
        if (e.target === genericMediaOverlay) {
            genericMediaOverlay.classList.add('hidden');
            document.body.classList.remove("modal-open");
            // Stop video playback when closing modal
            const video = mediaPreviewContent.querySelector('video');
            if (video) video.pause();
            mediaPreviewContent.innerHTML = '';
        }
    });

    const restrictedPostingCheckbox = document.getElementById('isRestrictedPostingCheckbox');

    if (restrictedPostingCheckbox) {
        restrictedPostingCheckbox.addEventListener('change', async function () {
            const communityName = this.dataset.communityName; 
            const isRestrictedPosting = this.checked;

            try {
                const res = await fetch(`/community/${communityName}/settings/restrict-posting`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ isRestrictedPosting })
                });

                const data = await res.json();

                if (res.ok) {
                    customAlert(data.message, "Success");
                } else {
                    // Revert the checkbox state if the save failed
                    this.checked = !isRestrictedPosting;
                    customAlert(data.error || "Failed to update posting restriction.", "Error");
                }
            } catch (err) {
                console.error('Update posting restriction failed:', err);
                // Revert the checkbox state on network error
                this.checked = !isRestrictedPosting;
                customAlert('An unexpected error occurred while saving the setting.', "Error");
            }
        });
    }

});
