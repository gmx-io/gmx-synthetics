import { toast as _toast } from "react-toastify";

const toastConfig = {
  position: "bottom-right",
  autoClose: 5000,
  hideProgressBar: true,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: false,
  progress: undefined,
  theme: "light",
};

export default {
  success: (message) => {
    _toast.success(message, toastConfig);
  },
  error: (message) => {
    _toast.error(message, toastConfig);
  },
};
