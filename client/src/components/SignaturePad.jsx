import { forwardRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';

const SignaturePad = forwardRef(function SignaturePad(_props, ref) {
  return (
    <div className="signature-pad-wrap">
      <SignatureCanvas
        ref={ref}
        penColor="#1c1917"
        canvasProps={{ width: 400, height: 160, className: 'signature-canvas' }}
      />
    </div>
  );
});

export default SignaturePad;
