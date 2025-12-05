"""
S3 storage service for video uploads
"""
import logging
import boto3
from botocore.exceptions import ClientError
from pathlib import Path
from typing import Optional

from ..config.config_loader import StorageConfig

logger = logging.getLogger(__name__)


class S3Service:
    """Service for handling S3 storage operations"""
    
    def __init__(self, config: StorageConfig):
        self.enabled = config.mode == "s3"
        self.bucket_name = config.s3_bucket
        self.region = config.s3_region
        self.access_key = config.s3_access_key
        self.secret_key = config.s3_secret_key
        
        self.s3_client = None
        if self.enabled and self._validate_config():
            try:
                self.s3_client = boto3.client(
                    's3',
                    region_name=self.region,
                    aws_access_key_id=self.access_key,
                    aws_secret_access_key=self.secret_key
                )
                logger.info(f"S3 Service initialized successfully for bucket: {self.bucket_name}")
            except Exception as e:
                
                logger.error(f"Failed to initialize S3 client: {e}")
                self.enabled = False
        else:
            if self.enabled:
                logger.warning("S3 mode enabled but configuration incomplete")

    def _validate_config(self) -> bool:
        """Validate required S3 configuration"""
        if not all([self.bucket_name, self.region, self.access_key, self.secret_key]):
            logger.warning("S3 configuration incomplete. S3 storage disabled.")
            return False
        return True

    def upload_file(self, file_path: str, object_name: str = None) -> Optional[str]:
        """
        Upload a file to S3 bucket and return the public URL
        
        Args:
            file_path: Path to file to upload
            object_name: S3 object name. If not specified, file_name is used
            
        Returns:
            Public URL of uploaded file if successful, None otherwise
        """
        if not self.enabled or not self.s3_client:
            logger.warning("S3 upload attempted but service is disabled or not initialized")
            return None

        path = Path(file_path)
        if not path.exists():
            logger.error(f"File not found: {file_path}")
            return None

        # If S3 object_name was not specified, use file name
        if object_name is None:
            object_name = path.name

        try:
            # Upload the file (without ACL since many buckets have ACLs disabled)
            extra_args = {'ContentType': 'video/mp4'}
            
            self.s3_client.upload_file(
                str(file_path), 
                self.bucket_name, 
                object_name,
                ExtraArgs=extra_args
            )
            
            # Generate a presigned URL that allows temporary public access
            # This works even if the bucket doesn't have public access enabled
            url = self.s3_client.generate_presigned_url(
                'get_object',
                Params={'Bucket': self.bucket_name, 'Key': object_name},
                ExpiresIn=604800  # 7 days (maximum allowed)
            )
            logger.info(f"File uploaded to S3 with presigned URL: {url}")
            return url

        except ClientError as e:
            logger.error(f"S3 upload failed: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error during S3 upload: {e}")
            return None

